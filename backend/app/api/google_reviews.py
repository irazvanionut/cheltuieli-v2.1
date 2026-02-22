import json
import time as time_module
from collections import deque
from datetime import datetime, timezone, timedelta, date
from typing import Optional, AsyncGenerator
from urllib.parse import urlparse, parse_qs

import httpx
from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, delete as sql_delete

from app.core.database import AsyncSessionLocal
from app.models.models import GoogleReview, Setting

router = APIRouter(tags=["google-reviews"])

# ─── In-memory SerpAPI call log (max 500 entries, lost on restart) ─────────────
_serp_log: deque = deque(maxlen=500)

def _log_serp_call(*, key_index: int, source: str, page: int,
                   status: str, status_code: int, ms: int, error: str = "", url: str = ""):
    _serp_log.appendleft({
        "ts": datetime.now(timezone.utc).isoformat(),
        "key": key_index,
        "source": source,
        "page": page,
        "status": status,
        "status_code": status_code,
        "ms": ms,
        "error": error,
        "url": url,
    })
    print(f"[SerpAPI] source={source} key={key_index} page={page} "
          f"status={status} ({status_code}) {ms}ms"
          + (f" ERR: {error}" if error else ""))

COOLDOWN_MINUTES = 5
ANALYSIS_COOLDOWN_HOURS = 4
SERPAPI_BASE = "https://serpapi.com/search.json"


def _get_next_url(page_data: dict, data_id: str) -> str | None:
    """
    Extract next_page_token from SerpAPI response and build a clean next-page URL.
    We always build from scratch so api_key and no_cache are NEVER embedded here —
    _fetch_serpapi_page will append them.
    """
    pagination = page_data.get("serpapi_pagination", {})

    # Try direct token first (most reliable)
    token = pagination.get("next_page_token")

    # Fallback: parse token out of the full next URL
    if not token:
        next_full = pagination.get("next", "")
        if next_full:
            try:
                token = parse_qs(urlparse(next_full).query).get("next_page_token", [None])[0]
            except Exception:
                pass

    if not token:
        return None

    # Build clean URL — no api_key, no no_cache (added by _fetch_serpapi_page)
    return (
        f"{SERPAPI_BASE}?engine=google_maps_reviews"
        f"&data_id={data_id}&hl=en&sort_by=newestFirst"
        f"&next_page_token={token}"
    )


# ─── helpers ──────────────────────────────────────────────────────────────────

def _parse_review(r: dict) -> dict:
    """Extract flat fields from a raw SerpAPI review dict."""
    user = r.get("user", {})
    details = r.get("details", {})

    iso_str = r.get("iso_date", "")
    try:
        iso_date = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    except Exception:
        iso_date = datetime.now(timezone.utc)

    def _int(v):
        try:
            return int(v)
        except Exception:
            return None

    extra = {k: v for k, v in details.items() if k not in ("food", "service", "atmosphere")}

    return {
        "review_id": r.get("review_id", ""),
        "rating": int(r.get("rating", 0)),
        "iso_date": iso_date,
        "date_text": r.get("date", ""),
        "snippet": r.get("snippet") or r.get("extracted_snippet", {}).get("original"),
        "snippet_translated": r.get("extracted_snippet", {}).get("translated"),
        "user_name": user.get("name"),
        "user_link": user.get("link"),
        "contributor_id": user.get("contributor_id"),
        "user_thumbnail": user.get("thumbnail"),
        "local_guide": bool(user.get("local_guide", False)),
        "user_reviews_count": int(user.get("reviews", 0) or 0),
        "user_photos_count": int(user.get("photos", 0) or 0),
        "food_rating": _int(details.get("food")),
        "service_rating": _int(details.get("service")),
        "atmosphere_rating": _int(details.get("atmosphere")),
        "details": extra,
        "images": r.get("images", []),
        "review_link": r.get("link"),
        "likes": int(r.get("likes", 0) or 0),
    }


async def _get_setting(db, key: str) -> str:
    result = await db.execute(select(Setting).where(Setting.cheie == key))
    s = result.scalar_one_or_none()
    return s.valoare if s else ""


async def _set_setting(db, key: str, value: str):
    result = await db.execute(select(Setting).where(Setting.cheie == key))
    s = result.scalar_one_or_none()
    if s:
        s.valoare = value
    else:
        db.add(Setting(cheie=key, valoare=value, tip="string"))


async def _select_serpapi_key(db) -> tuple[str, int]:
    """
    Selectează cheia SerpAPI activă și resetează contoarele lunar.
    Zile pare (1, 3, 5...) → cheie 1 | Zile impare (2, 4, 6...) → cheie 2
    Dacă cheia preferată nu e configurată, cade pe cealaltă.
    Returnează (api_key, key_index).
    """
    current_month = date.today().strftime("%Y-%m")
    stored_month = await _get_setting(db, "serpapi_calls_month")
    if stored_month != current_month:
        await _set_setting(db, "serpapi_calls_1", "0")
        await _set_setting(db, "serpapi_calls_2", "0")
        await _set_setting(db, "serpapi_calls_month", current_month)
        await db.commit()

    key1 = await _get_setting(db, "serpapi_api_key")
    key2 = await _get_setting(db, "serpapi_api_key_2")

    # Zile impare (1,3,5...) → cheie 1 | Zile pare (2,4,6...) → cheie 2
    preferred = 1 if date.today().day % 2 == 1 else 2

    if preferred == 1 and key1:
        return key1, 1
    if preferred == 2 and key2:
        return key2, 2
    # fallback
    if key1:
        return key1, 1
    if key2:
        return key2, 2
    raise ValueError("serpapi_api_key sau serpapi_data_id nu sunt configurate")


async def _increment_serpapi_counter(db, key_index: int, pages: int):
    """Incrementează contorul de apeluri pentru cheia dată."""
    setting_key = f"serpapi_calls_{key_index}"
    current = int(await _get_setting(db, setting_key) or "0")
    await _set_setting(db, setting_key, str(current + pages))


async def _fetch_serpapi_page(url: str, api_key: str,
                              key_index: int = 0, source: str = "?", page: int = 1) -> dict:
    """
    Call a SerpAPI URL. Always appends api_key and no_cache=true.
    URLs passed here must NOT already contain api_key (initial URLs and
    URLs built by _get_next_url never embed it).
    """
    sep = "&" if "?" in url else "?"
    clean_url = f"{url}{sep}api_key={api_key}"
    if "no_cache=true" not in clean_url:
        clean_url += "&no_cache=true"

    t0 = time_module.monotonic()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(clean_url)
            ms = int((time_module.monotonic() - t0) * 1000)
            resp.raise_for_status()
            _log_serp_call(key_index=key_index, source=source, page=page,
                           status="ok", status_code=resp.status_code, ms=ms, url=clean_url)
            return resp.json()
    except httpx.HTTPStatusError as e:
        ms = int((time_module.monotonic() - t0) * 1000)
        _log_serp_call(key_index=key_index, source=source, page=page,
                       status="error", status_code=e.response.status_code,
                       ms=ms, error=str(e), url=clean_url)
        raise
    except Exception as e:
        ms = int((time_module.monotonic() - t0) * 1000)
        _log_serp_call(key_index=key_index, source=source, page=page,
                       status="error", status_code=0, ms=ms, error=str(e), url=clean_url)
        raise


# ─── core refresh logic (also used by scheduler) ──────────────────────────────

async def do_refresh(source: str = "scheduler") -> dict:
    """
    Fetch new reviews from SerpAPI (newest first).
    Stop when we find a review already in DB.
    If all reviews on a page are new, continue to next page.
    Returns dict with inserted/skipped/pages_fetched.
    """
    async with AsyncSessionLocal() as db:
        api_key, key_index = await _select_serpapi_key(db)
        data_id = await _get_setting(db, "serpapi_data_id")

        if not data_id:
            raise ValueError("serpapi_data_id nu este configurat")

        # Get all known review_ids
        existing_result = await db.execute(select(GoogleReview.review_id))
        known_ids = set(row[0] for row in existing_result.fetchall())

        current_url = (
            f"{SERPAPI_BASE}?engine=google_maps_reviews"
            f"&data_id={data_id}&hl=en&sort_by=newestFirst&no_cache=true"
        )

        inserted = 0
        pages_fetched = 0
        stop = False

        while not stop:
            page_data = await _fetch_serpapi_page(
                current_url, api_key,
                key_index=key_index, source=source, page=pages_fetched + 1
            )
            pages_fetched += 1
            reviews = page_data.get("reviews", [])

            if not reviews:
                break

            found_existing_on_page = False

            for r in reviews:
                rid = r.get("review_id", "")
                if not rid:
                    continue
                if rid in known_ids:
                    # Hit a known review — stop here
                    found_existing_on_page = True
                    stop = True
                    break
                # New review — insert
                parsed = _parse_review(r)
                db.add(GoogleReview(**parsed))
                known_ids.add(rid)
                inserted += 1

            # If NO existing review found on this page, all were new → go to next page
            if not found_existing_on_page:
                next_url = _get_next_url(page_data, data_id)
                if next_url:
                    current_url = next_url
                else:
                    stop = True  # no more pages
            # else stop=True already set above

        await db.commit()

        # Update last_refresh timestamp + call counter
        now_iso = datetime.now(timezone.utc).isoformat()
        await _set_setting(db, "google_reviews_last_refresh", now_iso)
        await _increment_serpapi_counter(db, key_index, pages_fetched)
        await db.commit()

    return {
        "inserted": inserted,
        "pages_fetched": pages_fetched,
        "refreshed_at": now_iso,
    }


async def do_refetch_from_date(from_date: date) -> dict:
    """
    Șterge toate review-urile cu iso_date >= from_date și le re-fetchează
    din SerpAPI (no_cache=true, newest first). Cheile SerpAPI alternează
    per pagină pentru a distribui uniform apelurile.
    """
    from_dt = datetime.combine(from_date, datetime.min.time()).replace(tzinfo=timezone.utc)

    async with AsyncSessionLocal() as db:
        # 1. Numără și șterge review-urile din intervalul specificat
        count_result = await db.execute(
            select(func.count()).select_from(GoogleReview).where(GoogleReview.iso_date >= from_dt)
        )
        deleted_count = count_result.scalar() or 0

        await db.execute(
            sql_delete(GoogleReview).where(GoogleReview.iso_date >= from_dt)
        )
        await db.commit()

        # 2. Pregătește cheile disponibile pentru alternare per pagină
        data_id = await _get_setting(db, "serpapi_data_id")
        if not data_id:
            raise ValueError("serpapi_data_id nu este configurat")

        key1 = await _get_setting(db, "serpapi_api_key")
        key2 = await _get_setting(db, "serpapi_api_key_2")
        available_keys: list[tuple[str, int]] = []
        if key1:
            available_keys.append((key1, 1))
        if key2:
            available_keys.append((key2, 2))
        if not available_keys:
            raise ValueError("Nicio cheie SerpAPI configurată")

        # Reset lunar dacă e cazul
        current_month = date.today().strftime("%Y-%m")
        stored_month = await _get_setting(db, "serpapi_calls_month")
        if stored_month != current_month:
            await _set_setting(db, "serpapi_calls_1", "0")
            await _set_setting(db, "serpapi_calls_2", "0")
            await _set_setting(db, "serpapi_calls_month", current_month)
            await db.commit()

        # 3. Re-fetch cu alternare per pagină
        current_url = (
            f"{SERPAPI_BASE}?engine=google_maps_reviews"
            f"&data_id={data_id}&hl=en&sort_by=newestFirst&no_cache=true"
        )

        inserted = 0
        pages_fetched = 0
        calls_per_key: dict[int, int] = {}
        key_idx = 0
        stop = False
        stop_reason = "unknown"

        print(f"[Refetch] START from_date={from_date} from_dt={from_dt.isoformat()}")

        while not stop:
            api_key, key_index = available_keys[key_idx % len(available_keys)]
            key_idx += 1

            page_data = await _fetch_serpapi_page(
                current_url, api_key,
                key_index=key_index, source="refetch", page=pages_fetched + 1
            )
            pages_fetched += 1
            calls_per_key[key_index] = calls_per_key.get(key_index, 0) + 1

            reviews = page_data.get("reviews", [])
            pagination_raw = page_data.get("serpapi_pagination", {})
            print(f"[Refetch] Page {pages_fetched}: {len(reviews)} reviews, "
                  f"pagination keys={list(pagination_raw.keys())}, "
                  f"has_next={'next' in pagination_raw}, "
                  f"has_token={'next_page_token' in pagination_raw}")

            if not reviews:
                stop_reason = "empty_page"
                print(f"[Refetch] Stopping: empty reviews on page {pages_fetched}")
                break

            hit_old = False
            for r in reviews:
                rid = r.get("review_id", "")
                if not rid:
                    continue
                parsed = _parse_review(r)
                review_dt = parsed["iso_date"]
                is_old = review_dt < from_dt
                print(f"[Refetch]   review_id={rid[:12]} iso_date={review_dt.isoformat()} old={is_old}")
                if is_old:
                    hit_old = True
                    stop = True
                    stop_reason = f"hit_old_review date={review_dt.isoformat()}"
                    break
                db.add(GoogleReview(**parsed))
                inserted += 1

            if not hit_old:
                next_url = _get_next_url(page_data, data_id)
                print(f"[Refetch] Page {pages_fetched}: hit_old=False, next_url={'YES' if next_url else 'NONE'}")
                if next_url:
                    current_url = next_url
                else:
                    stop = True
                    stop_reason = "no_next_token"
            else:
                print(f"[Refetch] Stopping after page {pages_fetched}: {stop_reason}")

        print(f"[Refetch] DONE pages={pages_fetched} inserted={inserted} stop_reason={stop_reason}")

        await db.commit()

        # 4. Actualizează contoare și timestamp
        now_iso = datetime.now(timezone.utc).isoformat()
        await _set_setting(db, "google_reviews_last_refresh", now_iso)
        for kidx, calls in calls_per_key.items():
            if calls > 0:
                await _increment_serpapi_counter(db, kidx, calls)
        await db.commit()

    return {
        "deleted": deleted_count,
        "inserted": inserted,
        "pages_fetched": pages_fetched,
        "calls_per_key": calls_per_key,
        "from_date": from_date.isoformat(),
        "refreshed_at": now_iso,
        "stop_reason": stop_reason,
    }


SERPAPI_ACCOUNT_URL = "https://serpapi.com/account"

ACCOUNT_FIELDS = [
    "plan_name", "account_status", "searches_per_month",
    "plan_searches_left", "extra_credits", "total_searches_left",
    "this_month_usage", "this_hour_searches", "last_hour_searches",
    "account_rate_limit_per_hour",
]


async def do_fetch_serpapi_account() -> dict:
    """
    Fetch /account from SerpAPI for each configured key.
    Stores results as JSON in serpapi_account_1 / serpapi_account_2.
    Returns {"key1": {...}, "key2": {...}, "fetched_at": "..."}.
    """
    async with AsyncSessionLocal() as db:
        key1 = await _get_setting(db, "serpapi_api_key")
        key2 = await _get_setting(db, "serpapi_api_key_2")

    results = {}
    for label, api_key in [("key1", key1), ("key2", key2)]:
        if not api_key:
            results[label] = None
            continue
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(SERPAPI_ACCOUNT_URL, params={"api_key": api_key})
                resp.raise_for_status()
                data = resp.json()
                results[label] = {f: data.get(f) for f in ACCOUNT_FIELDS}
        except Exception as e:
            results[label] = {"error": str(e)}

    fetched_at = datetime.now(timezone.utc).isoformat()
    results["fetched_at"] = fetched_at

    async with AsyncSessionLocal() as db:
        await _set_setting(db, "serpapi_account_1", json.dumps(results.get("key1") or {}))
        await _set_setting(db, "serpapi_account_2", json.dumps(results.get("key2") or {}))
        await _set_setting(db, "serpapi_account_fetched_at", fetched_at)
        await db.commit()

    return results


# ─── endpoints ────────────────────────────────────────────────────────────────

@router.get("/google-reviews/serpapi-account")
async def get_serpapi_account(refresh: bool = False):
    """Returnează info cont SerpAPI (stocat zilnic la 08:00). refresh=true forțează re-fetch."""
    if refresh:
        return await do_fetch_serpapi_account()

    async with AsyncSessionLocal() as db:
        raw1 = await _get_setting(db, "serpapi_account_1")
        raw2 = await _get_setting(db, "serpapi_account_2")
        fetched_at = await _get_setting(db, "serpapi_account_fetched_at")

    def parse(raw: str) -> dict | None:
        if not raw:
            return None
        try:
            d = json.loads(raw)
            return d if d else None
        except Exception:
            return None

    return {
        "key1": parse(raw1),
        "key2": parse(raw2),
        "fetched_at": fetched_at or None,
    }


@router.get("/google-reviews/serp-log")
async def get_serp_log(limit: int = 100):
    """Returnează ultimele N intrări din log-ul apelurilor SerpAPI."""
    return list(_serp_log)[:limit]


@router.get("/google-reviews/refresh-status")
async def get_refresh_status():
    """Return last refresh time and remaining cooldown seconds."""
    async with AsyncSessionLocal() as db:
        last_str = await _get_setting(db, "google_reviews_last_refresh")

    remaining_seconds = 0
    last_refresh_iso = None

    if last_str:
        try:
            last_dt = datetime.fromisoformat(last_str)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
            cooldown_secs = COOLDOWN_MINUTES * 60
            remaining_seconds = max(0, int(cooldown_secs - elapsed))
            last_refresh_iso = last_str
        except Exception:
            pass

    return {
        "last_refresh": last_refresh_iso,
        "remaining_seconds": remaining_seconds,
        "cooldown_minutes": COOLDOWN_MINUTES,
    }


@router.post("/google-reviews/refresh")
async def trigger_refresh(force: bool = False):
    """
    Manually trigger a SerpAPI refresh.
    Enforces 10-minute cooldown unless force=True.
    """
    async with AsyncSessionLocal() as db:
        last_str = await _get_setting(db, "google_reviews_last_refresh")

    if not force and last_str:
        try:
            last_dt = datetime.fromisoformat(last_str)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
            cooldown_secs = COOLDOWN_MINUTES * 60
            if elapsed < cooldown_secs:
                remaining = int(cooldown_secs - elapsed)
                raise HTTPException(
                    status_code=429,
                    detail={
                        "message": "Cooldown activ",
                        "remaining_seconds": remaining,
                    },
                )
        except HTTPException:
            raise
        except Exception:
            pass

    try:
        result = await do_refresh(source="manual")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Eroare SerpAPI: {str(e)}")

    return result


@router.post("/google-reviews/refetch-from-date")
async def refetch_from_date(request: Request):
    """
    Șterge review-urile de la data specificată și le re-fetchează din SerpAPI.
    Body: { "date": "YYYY-MM-DD" }
    Cheile SerpAPI alternează per pagină.
    """
    body = await request.json()
    date_str = body.get("date", "")
    if not date_str:
        raise HTTPException(status_code=400, detail="Câmpul 'date' este obligatoriu")
    try:
        from_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Format dată invalid (YYYY-MM-DD)")

    try:
        result = await do_refetch_from_date(from_date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Eroare SerpAPI: {str(e)}")

    return result


@router.post("/google-reviews/ingest")
async def ingest_reviews(file: UploadFile = File(...)):
    """
    Accept a reviews_output_full.json file (SerpAPI format).
    Skips reviews whose review_id already exists in the DB.
    """
    raw = await file.read()
    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Fișier JSON invalid")

    all_reviews: list[dict] = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and "reviews" in item:
                all_reviews.extend(item["reviews"])
            elif isinstance(item, dict) and "review_id" in item:
                all_reviews.append(item)
    elif isinstance(data, dict):
        if "reviews" in data:
            all_reviews.extend(data["reviews"])

    if not all_reviews:
        raise HTTPException(status_code=400, detail="Nu s-au găsit recenzii în fișier")

    async with AsyncSessionLocal() as db:
        existing_result = await db.execute(select(GoogleReview.review_id))
        existing_ids = set(row[0] for row in existing_result.fetchall())

        inserted = 0
        skipped = 0
        errors = 0

        for raw_review in all_reviews:
            rid = raw_review.get("review_id", "")
            if not rid:
                errors += 1
                continue
            if rid in existing_ids:
                skipped += 1
                continue
            try:
                parsed = _parse_review(raw_review)
                db.add(GoogleReview(**parsed))
                existing_ids.add(rid)
                inserted += 1
            except Exception:
                errors += 1

        await db.commit()

    return {
        "inserted": inserted,
        "skipped": skipped,
        "errors": errors,
        "total_in_file": len(all_reviews),
    }


@router.post("/google-reviews/ingest-json")
async def ingest_reviews_json(request: Request):
    """
    Accept raw JSON body (same SerpAPI format as /ingest).
    Skips reviews whose review_id already exists in the DB.
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Body JSON invalid")

    all_reviews: list[dict] = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and "reviews" in item:
                all_reviews.extend(item["reviews"])
            elif isinstance(item, dict) and "review_id" in item:
                all_reviews.append(item)
    elif isinstance(data, dict):
        if "reviews" in data:
            all_reviews.extend(data["reviews"])
        elif "review_id" in data:
            all_reviews.append(data)

    if not all_reviews:
        raise HTTPException(status_code=400, detail="Nu s-au găsit recenzii în body")

    async with AsyncSessionLocal() as db:
        existing_result = await db.execute(select(GoogleReview.review_id))
        existing_ids = set(row[0] for row in existing_result.fetchall())

        inserted = 0
        skipped = 0
        errors = 0

        for raw_review in all_reviews:
            rid = raw_review.get("review_id", "")
            if not rid:
                errors += 1
                continue
            if rid in existing_ids:
                skipped += 1
                continue
            try:
                parsed = _parse_review(raw_review)
                db.add(GoogleReview(**parsed))
                existing_ids.add(rid)
                inserted += 1
            except Exception:
                errors += 1

        await db.commit()

    return {
        "inserted": inserted,
        "skipped": skipped,
        "errors": errors,
        "total_in_file": len(all_reviews),
    }


@router.get("/google-reviews/summary")
async def get_reviews_summary():
    """
    avg_overall   = ratingul curent (media tuturor recenziilor)
    avg_as_of_30d = ratingul cum era acum 30 zile (media tuturor recenziilor cu iso_date <= now-30d)
    trend_30d     = avg_overall - avg_as_of_30d  (pozitiv = a crescut, negativ = a scazut)
    avg_as_of_60d = ratingul cum era acum 60 zile
    trend_60d     = avg_overall - avg_as_of_60d
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff_30d = now - timedelta(days=30)
    cutoff_60d = now - timedelta(days=60)

    async with AsyncSessionLocal() as db:
        # Ratingul curent — media TUTUROR recenziilor
        row0 = await db.execute(
            select(func.avg(GoogleReview.rating).label("avg"), func.count(GoogleReview.id).label("cnt"))
        )
        overall = row0.one()

        # Recenziile de azi
        row1 = await db.execute(
            select(func.avg(GoogleReview.rating).label("avg"), func.count(GoogleReview.id).label("cnt"))
            .where(GoogleReview.iso_date >= today_start)
        )
        today = row1.one()

        # Ratingul cum era acum 30 zile (media tuturor recenziilor existente la acel moment)
        row2 = await db.execute(
            select(func.avg(GoogleReview.rating).label("avg"), func.count(GoogleReview.id).label("cnt"))
            .where(GoogleReview.iso_date <= cutoff_30d)
        )
        as_of_30d = row2.one()

        # Ratingul cum era acum 60 zile
        row3 = await db.execute(
            select(func.avg(GoogleReview.rating).label("avg"), func.count(GoogleReview.id).label("cnt"))
            .where(GoogleReview.iso_date <= cutoff_60d)
        )
        as_of_60d = row3.one()

    avg_overall = round(float(overall.avg), 2) if overall.avg else None
    avg_today = round(float(today.avg), 2) if today.avg else None
    avg_as_of_30d = round(float(as_of_30d.avg), 2) if as_of_30d.avg else None
    avg_as_of_60d = round(float(as_of_60d.avg), 2) if as_of_60d.avg else None
    # trend = curent - cum era atunci (negativ = a scazut fata de acel moment)
    trend_30d = round(avg_overall - avg_as_of_30d, 2) if avg_overall is not None and avg_as_of_30d is not None else None
    trend_60d = round(avg_overall - avg_as_of_60d, 2) if avg_overall is not None and avg_as_of_60d is not None else None

    return {
        "avg_today": avg_today,
        "count_today": today.cnt,
        "avg_overall": avg_overall,
        "count_overall": overall.cnt,
        "avg_as_of_30d": avg_as_of_30d,
        "trend_30d": trend_30d,
        "avg_as_of_60d": avg_as_of_60d,
        "trend_60d": trend_60d,
    }


@router.get("/google-reviews")
async def get_reviews(limit: Optional[int] = None):
    """Return all reviews ordered by iso_date descending."""
    async with AsyncSessionLocal() as db:
        q = select(GoogleReview).order_by(GoogleReview.iso_date.desc())
        if limit:
            q = q.limit(limit)
        result = await db.execute(q)
        reviews = result.scalars().all()

    return [
        {
            "id": r.id,
            "review_id": r.review_id,
            "rating": r.rating,
            "iso_date": r.iso_date.isoformat() if r.iso_date else None,
            "date_text": r.date_text,
            "snippet": r.snippet,
            "snippet_translated": r.snippet_translated,
            "user_name": r.user_name,
            "user_link": r.user_link,
            "contributor_id": r.contributor_id,
            "user_thumbnail": r.user_thumbnail,
            "local_guide": r.local_guide,
            "user_reviews_count": r.user_reviews_count,
            "user_photos_count": r.user_photos_count,
            "food_rating": r.food_rating,
            "service_rating": r.service_rating,
            "atmosphere_rating": r.atmosphere_rating,
            "details": r.details,
            "images": r.images,
            "review_link": r.review_link,
            "likes": r.likes,
        }
        for r in reviews
    ]


# ─── AI analysis prompts ──────────────────────────────────────────────────────

_PROMPT_REVIEW = """\
You are a restaurant review analyst. Analyze the review below and respond EXCLUSIVELY with valid JSON.
Do NOT add any text before or after the JSON.

Review:
- Rating: {rating}/5
- Date: {date}
- Text: "{snippet}"

Return EXACTLY this JSON (no comments, no markdown):
{{
  "complaints": [],
  "positives": [],
  "people": [],
  "urgent": false
}}

Strict rules:
- "complaints": ALL specific problems or complaints mentioned in the text, translated/written in Romanian, max 5, [] if none
- "positives": ALL positive aspects explicitly mentioned, in Romanian, max 3, [] if none
- "people": ONLY proper names of staff or persons explicitly mentioned by name, [] if none
- "urgent": true ONLY for serious hygiene/safety issues or aggressive behavior
- Respond ONLY with JSON, zero additional text\
"""

_PROMPT_NEGATIVE_SUMMARY = """\
You are a restaurant quality analyst. Below are extracted data from {count} low-rated reviews (1-2 stars) from the last {days} days.
Your goal: identify ALL complaint patterns, their frequency, and any staff mentioned.

Review analyses:
{analyses}

Respond EXCLUSIVELY with valid JSON (no markdown, no extra text):
{{
  "complaints": [
    {{"complaint": "<specific complaint in Romanian>", "frequency": 0, "severity": "<low|medium|high>"}}
  ],
  "people": [
    {{"name": "<Name>", "context": "<what was said, in Romanian>"}}
  ]
}}

Rules:
- "complaints": list ALL distinct complaint patterns found, sorted by frequency descending, NO maximum limit
- severity: "high"=hygiene/safety/aggressive behavior, "medium"=food quality/service/wait time, "low"=minor issues
- "people": only explicitly mentioned staff/person names in negative context
- All string values MUST be in Romanian
- Respond ONLY with JSON\
"""

_PROMPT_POSITIVE_SUMMARY = """\
You are a restaurant quality analyst. Below are extracted data from {count} positive reviews (3-5 stars) from the last {days} days.
Your goal: identify what the restaurant does well.

Review analyses:
{analyses}

Respond EXCLUSIVELY with valid JSON (no markdown, no extra text):
{{
  "positives": [
    {{"aspect": "<positive aspect in Romanian>", "frequency": 0}}
  ],
  "people": [
    {{"name": "<Name>", "context": "<what was said, in Romanian>"}}
  ],
  "summary": "<2 sentences about what customers appreciate most, in Romanian>"
}}

Rules:
- "positives": sorted by frequency descending, maximum 10 items
- "people": only explicitly mentioned staff/person names in positive context
- All string values MUST be in Romanian
- Respond ONLY with JSON\
"""

_PROMPT_FINAL = """\
You are a senior restaurant analyst. Create a concise executive report.

NEGATIVE REVIEWS ({neg_count} reviews, rating 1-2 stars):
{negative_json}

POSITIVE REVIEWS ({pos_count} reviews, rating 3-5 stars):
{positive_json}

RECENT PERFORMANCE ({period}, {recent_count} reviews):
- Recent average rating: {recent_avg} stars
- Overall average rating: {overall_avg} stars (across {total_count} reviews)

Respond EXCLUSIVELY with valid JSON (no markdown, no extra text):
{{
  "sentiment_general": "<pozitiv|negativ|neutru|mixt>",
  "rezumat_executiv": "<2-3 sentences summarizing the overall situation, in Romanian>",
  "recent_trend": {{
    "direction": "<în creștere|în scădere|stabil>",
    "note": "<1 sentence describing the recent trend, in Romanian>"
  }},
  "top_10_complaints": [
    {{"rank": 1, "complaint": "<in Romanian>", "frequency": 0, "severity": "<low|medium|high>"}}
  ],
  "positive_summary": "<3-4 sentences about what works well at this restaurant, in Romanian>",
  "people_mentioned": [
    {{"name": "<Name>", "sentiment": "<pozitiv|negativ>", "context": "<in Romanian>", "appearances": 0}}
  ]
}}

Strict rules:
- "top_10_complaints": exactly the 10 most critical/frequent complaints, rank 1 = most important
- "people_mentioned": merge people from both analyses, deduplicate, sort by appearances descending
- All string values MUST be in Romanian
- Respond ONLY with JSON\
"""


async def _ollama_generate(host: str, model: str, prompt: str, timeout: int = 90) -> str:
    """Call Ollama /api/generate and return the response text."""
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            f"{host}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0, "top_p": 1, "seed": 42},
            },
        )
        resp.raise_for_status()
        return resp.json().get("response", "")


def _extract_json(raw: str) -> dict:
    """Extract the first JSON object from a string."""
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start >= 0 and end > start:
        return json.loads(raw[start:end])
    raise ValueError(f"No JSON found in: {raw[:200]}")


def _build_summary(
    neg_result: dict,
    pos_result: dict,
    neg_count: int,
    pos_count: int,
    recent_avg: float,
    overall_avg: float,
    period: str,
) -> dict:
    """Build the final summary dict purely from structured data — no LLM call."""
    total = neg_count + pos_count

    # Sentiment general
    if total == 0:
        sentiment = "neutru"
    elif neg_count == 0:
        sentiment = "pozitiv"
    elif pos_count == 0:
        sentiment = "negativ"
    else:
        ratio = neg_count / total
        sentiment = "negativ" if ratio >= 0.5 else "pozitiv" if ratio <= 0.2 else "mixt"

    # Recent trend — computed from ratings
    diff = round(recent_avg - overall_avg, 2) if recent_avg and overall_avg else 0
    if diff >= 0.2:
        direction = "în creștere"
        note = f"Rating recent ({period}): {recent_avg} ★ față de media globală {overall_avg} ★"
    elif diff <= -0.2:
        direction = "în scădere"
        note = f"Rating recent ({period}): {recent_avg} ★ față de media globală {overall_avg} ★"
    else:
        direction = "stabil"
        note = f"Rating recent ({period}): {recent_avg} ★ ≈ media globală {overall_avg} ★"

    # Top 10 complaints — take directly from neg_result (already sorted by frequency)
    raw_complaints = neg_result.get("complaints", [])
    top_10 = [
        {
            "rank": i + 1,
            "complaint": c.get("complaint", ""),
            "frequency": c.get("frequency", 0),
            "severity": c.get("severity", "low"),
        }
        for i, c in enumerate(raw_complaints[:10])
        if c.get("complaint")
    ]

    # Positive summary text
    positive_summary = pos_result.get("summary", "")

    # People mentioned — merge neg + pos, deduplicate by name
    people: dict[str, dict] = {}
    for p in neg_result.get("people", []):
        name = (p.get("name") or "").strip()
        if name:
            people[name] = {
                "name": name,
                "sentiment": "negativ",
                "context": p.get("context", ""),
                "appearances": 1,
            }
    for p in pos_result.get("people", []):
        name = (p.get("name") or "").strip()
        if name:
            if name in people:
                people[name]["appearances"] += 1
                people[name]["sentiment"] = "mixt"
                people[name]["context"] += "; " + p.get("context", "")
            else:
                people[name] = {
                    "name": name,
                    "sentiment": "pozitiv",
                    "context": p.get("context", ""),
                    "appearances": 1,
                }
    people_list = sorted(people.values(), key=lambda x: x["appearances"], reverse=True)

    # Rezumat executiv — deterministic, no hallucination
    neg_pct = round(neg_count / total * 100) if total > 0 else 0
    pos_pct = 100 - neg_pct
    rezumat = f"Din {total} recenzii analizate: {neg_pct}% negative (1-2★), {pos_pct}% pozitive (3-5★)."
    if top_10:
        rezumat += f" Cea mai frecventă problemă: {top_10[0]['complaint'].rstrip('.')}."
    if positive_summary:
        first = positive_summary.split(".")[0].strip()
        if first:
            rezumat += f" {first}."

    return {
        "sentiment_general": sentiment,
        "rezumat_executiv": rezumat,
        "recent_trend": {"direction": direction, "note": note},
        "top_10_complaints": top_10,
        "positive_summary": positive_summary,
        "people_mentioned": people_list,
    }


async def _run_analysis_core(ollama_host: str, chat_model: str) -> dict:
    """
    Core logic: analyze reviews from last 180 days using 4-phase approach.
    Phase 1: per-review analysis
    Phase 2a: negative summary (≤2★)
    Phase 2b: positive summary (>2★)
    Phase 3: final executive report
    """
    async with AsyncSessionLocal() as db:
        cutoff = datetime.now(timezone.utc) - timedelta(days=180)
        result = await db.execute(
            select(GoogleReview)
            .where(GoogleReview.iso_date >= cutoff)
            .where(GoogleReview.snippet.isnot(None))
            .order_by(GoogleReview.iso_date.desc())
        )
        reviews = result.scalars().all()

    if not reviews:
        return {"error": "Nicio recenzie cu text în ultimele 180 de zile"}

    # ── Phase 1: per-review analysis ─────────────────────────────────────────
    analyses: list[dict] = []
    for rev in reviews:
        snippet = (rev.snippet or "").strip()
        if not snippet:
            continue
        date_str = rev.iso_date.strftime("%Y-%m-%d") if rev.iso_date else "necunoscută"
        prompt = _PROMPT_REVIEW.format(rating=rev.rating, date=date_str, snippet=snippet[:500])
        try:
            raw = await _ollama_generate(ollama_host, chat_model, prompt, timeout=90)
            parsed = _extract_json(raw)
            parsed.update({"_id": rev.review_id, "_rating": rev.rating})
            analyses.append(parsed)
        except Exception:
            analyses.append({"_id": rev.review_id, "_rating": rev.rating, "_skip": True})

    valid = [a for a in analyses if not a.get("_skip")]
    if not valid:
        return {"error": "Nicio recenzie analizată", "analyzed": 0, "total": len(reviews)}

    def _clean(a: dict) -> dict:
        return {k: v for k, v in a.items() if not k.startswith("_")}

    neg_analyses = [a for a in valid if a.get("_rating", 5) <= 2]
    pos_analyses = [a for a in valid if a.get("_rating", 5) > 2]

    # ── Phase 2a: negative summary ────────────────────────────────────────────
    neg_result: dict = {}
    if neg_analyses:
        neg_text = json.dumps([_clean(a) for a in neg_analyses], ensure_ascii=False)
        if len(neg_text) > 12000:
            neg_text = neg_text[:12000] + "…]"
        try:
            raw = await _ollama_generate(
                ollama_host, chat_model,
                _PROMPT_NEGATIVE_SUMMARY.format(count=len(neg_analyses), days=180, analyses=neg_text),
                timeout=180,
            )
            neg_result = _extract_json(raw)
        except Exception as e:
            neg_result = {"error": str(e)}

    # ── Phase 2b: positive summary ────────────────────────────────────────────
    pos_result: dict = {}
    if pos_analyses:
        pos_text = json.dumps([_clean(a) for a in pos_analyses], ensure_ascii=False)
        if len(pos_text) > 12000:
            pos_text = pos_text[:12000] + "…]"
        try:
            raw = await _ollama_generate(
                ollama_host, chat_model,
                _PROMPT_POSITIVE_SUMMARY.format(count=len(pos_analyses), days=180, analyses=pos_text),
                timeout=180,
            )
            pos_result = _extract_json(raw)
        except Exception as e:
            pos_result = {"error": str(e)}

    # ── Compute recent trend ──────────────────────────────────────────────────
    now_utc = datetime.now(timezone.utc)
    week_ago = now_utc - timedelta(days=7)
    recent_7d = [r for r in reviews if r.iso_date and r.iso_date >= week_ago]
    if len(recent_7d) >= 7:
        recent = recent_7d
        period = "ultimele 7 zile"
    else:
        recent = list(reviews[:7])
        period = f"ultimele {len(recent)} recenzii"

    recent_avg = round(sum(r.rating for r in recent) / len(recent), 2) if recent else 0.0
    overall_avg = round(sum(r.rating for r in reviews) / len(reviews), 2) if reviews else 0.0

    # ── Build summary from structured data (no LLM call — avoids contradictions) ─
    summary = _build_summary(neg_result, pos_result, len(neg_analyses), len(pos_analyses),
                             recent_avg, overall_avg, period)

    return {
        "summary": summary,
        "analyzed": len(valid),
        "total": len(reviews),
        "neg_count": len(neg_analyses),
        "pos_count": len(pos_analyses),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


async def do_analysis() -> dict:
    """Called by scheduler — runs analysis and stores result in DB."""
    async with AsyncSessionLocal() as db:
        ollama_host = (await _get_setting(db, "ollama_host")) or "http://ollama:11434"
        chat_model = (await _get_setting(db, "ollama_chat_model")) or "llama3.2"

    result = await _run_analysis_core(ollama_host, chat_model)

    async with AsyncSessionLocal() as db:
        await _set_setting(db, "google_reviews_analysis", json.dumps(result, ensure_ascii=False))
        await _set_setting(db, "google_reviews_analysis_at", datetime.now(timezone.utc).isoformat())
        await db.commit()

    return result


@router.get("/google-reviews/analysis")
async def get_stored_analysis():
    """Return the last stored AI analysis + cooldown info."""
    async with AsyncSessionLocal() as db:
        raw = await _get_setting(db, "google_reviews_analysis")
        last_str = await _get_setting(db, "google_reviews_analysis_at")

    result = json.loads(raw) if raw else None
    remaining_seconds = 0
    if last_str:
        try:
            last_dt = datetime.fromisoformat(last_str)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
            cooldown_secs = ANALYSIS_COOLDOWN_HOURS * 3600
            remaining_seconds = max(0, int(cooldown_secs - elapsed))
        except Exception:
            pass

    return {
        "result": result,
        "last_analysis_at": last_str or None,
        "remaining_seconds": remaining_seconds,
        "cooldown_hours": ANALYSIS_COOLDOWN_HOURS,
    }


@router.get("/google-reviews/analyze")
async def analyze_reviews_stream(force: bool = False):
    """
    SSE stream: analyze each review individually (phase 1) then summarize (phase 2).
    Enforces a 3-hour cooldown unless force=True.
    Saves result to DB when done.
    """
    async def _stream() -> AsyncGenerator[str, None]:
        # ── Cooldown check ────────────────────────────────────────────────
        async with AsyncSessionLocal() as db:
            last_str = await _get_setting(db, "google_reviews_analysis_at")
            ollama_host = (await _get_setting(db, "ollama_host")) or "http://ollama:11434"
            chat_model = (await _get_setting(db, "ollama_chat_model")) or "llama3.2"

        if not force and last_str:
            try:
                last_dt = datetime.fromisoformat(last_str)
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
                cooldown_secs = ANALYSIS_COOLDOWN_HOURS * 3600
                if elapsed < cooldown_secs:
                    remaining = int(cooldown_secs - elapsed)
                    yield f"data: {json.dumps({'type': 'cooldown', 'remaining_seconds': remaining})}\n\n"
                    return
            except Exception:
                pass

        # ── Load reviews ──────────────────────────────────────────────────
        async with AsyncSessionLocal() as db:
            cutoff = datetime.now(timezone.utc) - timedelta(days=180)
            result = await db.execute(
                select(GoogleReview)
                .where(GoogleReview.iso_date >= cutoff)
                .where(GoogleReview.snippet.isnot(None))
                .order_by(GoogleReview.iso_date.desc())
            )
            reviews = result.scalars().all()

        if not reviews:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Nicio recenzie cu text în ultimele 180 de zile'})}\n\n"
            return

        total = len(reviews)
        yield f"data: {json.dumps({'type': 'start', 'total': total})}\n\n"

        # ── Phase 1: per-review analysis ──────────────────────────────────
        analyses: list[dict] = []
        for i, rev in enumerate(reviews):
            snippet = (rev.snippet or "").strip()
            if not snippet:
                yield f"data: {json.dumps({'type': 'progress', 'current': i + 1, 'total': total})}\n\n"
                continue

            date_str = rev.iso_date.strftime("%Y-%m-%d") if rev.iso_date else "necunoscută"
            prompt = _PROMPT_REVIEW.format(rating=rev.rating, date=date_str, snippet=snippet[:500])
            try:
                raw = await _ollama_generate(ollama_host, chat_model, prompt, timeout=90)
                parsed = _extract_json(raw)
                parsed.update({"_id": rev.review_id, "_rating": rev.rating})
                analyses.append(parsed)
            except Exception:
                analyses.append({"_id": rev.review_id, "_rating": rev.rating, "_skip": True})

            yield f"data: {json.dumps({'type': 'progress', 'current': i + 1, 'total': total})}\n\n"

        valid = [a for a in analyses if not a.get("_skip")]

        def _clean(a: dict) -> dict:
            return {k: v for k, v in a.items() if not k.startswith("_")}

        neg_analyses = [a for a in valid if a.get("_rating", 5) <= 2]
        pos_analyses = [a for a in valid if a.get("_rating", 5) > 2]

        # ── Phase 2a: negative summary ────────────────────────────────────
        yield f"data: {json.dumps({'type': 'phase', 'name': 'neg_summary', 'neg_count': len(neg_analyses)})}\n\n"
        neg_result: dict = {}
        if neg_analyses:
            neg_text = json.dumps([_clean(a) for a in neg_analyses], ensure_ascii=False)
            if len(neg_text) > 12000:
                neg_text = neg_text[:12000] + "…]"
            try:
                raw = await _ollama_generate(
                    ollama_host, chat_model,
                    _PROMPT_NEGATIVE_SUMMARY.format(count=len(neg_analyses), days=180, analyses=neg_text),
                    timeout=180,
                )
                neg_result = _extract_json(raw)
            except Exception as e:
                neg_result = {"error": str(e)}

        # ── Phase 2b: positive summary ────────────────────────────────────
        yield f"data: {json.dumps({'type': 'phase', 'name': 'pos_summary', 'pos_count': len(pos_analyses)})}\n\n"
        pos_result: dict = {}
        if pos_analyses:
            pos_text = json.dumps([_clean(a) for a in pos_analyses], ensure_ascii=False)
            if len(pos_text) > 12000:
                pos_text = pos_text[:12000] + "…]"
            try:
                raw = await _ollama_generate(
                    ollama_host, chat_model,
                    _PROMPT_POSITIVE_SUMMARY.format(count=len(pos_analyses), days=180, analyses=pos_text),
                    timeout=180,
                )
                pos_result = _extract_json(raw)
            except Exception as e:
                pos_result = {"error": str(e)}

        # ── Compute recent trend ──────────────────────────────────────────
        now_utc = datetime.now(timezone.utc)
        week_ago = now_utc - timedelta(days=7)
        recent_7d = [r for r in reviews if r.iso_date and r.iso_date >= week_ago]
        if len(recent_7d) >= 7:
            recent = recent_7d
            period = "ultimele 7 zile"
        else:
            recent = list(reviews[:7])
            period = f"ultimele {len(recent)} recenzii"

        recent_avg = round(sum(r.rating for r in recent) / len(recent), 2) if recent else 0.0
        overall_avg = round(sum(r.rating for r in reviews) / len(reviews), 2) if reviews else 0.0

        # ── Build summary from structured data (no LLM — avoids contradictions) ─
        summary = _build_summary(neg_result, pos_result, len(neg_analyses), len(pos_analyses),
                                 recent_avg, overall_avg, period)

        result_data = {
            "summary": summary,
            "analyzed": len(valid),
            "total": total,
            "neg_count": len(neg_analyses),
            "pos_count": len(pos_analyses),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

        # ── Save to DB (cooldown only if something was analyzed) ──────────
        async with AsyncSessionLocal() as db:
            await _set_setting(db, "google_reviews_analysis", json.dumps(result_data, ensure_ascii=False))
            if len(valid) > 0:
                await _set_setting(db, "google_reviews_analysis_at", datetime.now(timezone.utc).isoformat())
            await db.commit()

        yield f"data: {json.dumps({'type': 'done', **result_data})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

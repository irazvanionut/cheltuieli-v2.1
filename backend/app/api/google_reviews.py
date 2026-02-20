import json
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from sqlalchemy import select, func

from app.core.database import AsyncSessionLocal
from app.models.models import GoogleReview, Setting

router = APIRouter(tags=["google-reviews"])

COOLDOWN_MINUTES = 10
SERPAPI_BASE = "https://serpapi.com/search.json"


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


async def _fetch_serpapi_page(url: str, api_key: str) -> dict:
    sep = "&" if "?" in url else "?"
    full_url = f"{url}{sep}api_key={api_key}" if "api_key=" not in url else url
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(full_url)
        resp.raise_for_status()
        return resp.json()


# ─── core refresh logic (also used by scheduler) ──────────────────────────────

async def do_refresh() -> dict:
    """
    Fetch new reviews from SerpAPI (newest first).
    Stop when we find a review already in DB.
    If all reviews on a page are new, continue to next page.
    Returns dict with inserted/skipped/pages_fetched.
    """
    async with AsyncSessionLocal() as db:
        api_key = await _get_setting(db, "serpapi_api_key")
        data_id = await _get_setting(db, "serpapi_data_id")

        if not api_key or not data_id:
            raise ValueError("serpapi_api_key sau serpapi_data_id nu sunt configurate")

        # Get all known review_ids
        existing_result = await db.execute(select(GoogleReview.review_id))
        known_ids = set(row[0] for row in existing_result.fetchall())

        current_url = (
            f"{SERPAPI_BASE}?engine=google_maps_reviews"
            f"&data_id={data_id}&hl=en&sort_by=newestFirst"
        )

        inserted = 0
        pages_fetched = 0
        stop = False

        while not stop:
            page_data = await _fetch_serpapi_page(current_url, api_key)
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
                next_url = page_data.get("serpapi_pagination", {}).get("next")
                if next_url:
                    current_url = next_url
                else:
                    stop = True  # no more pages
            # else stop=True already set above

        await db.commit()

        # Update last_refresh timestamp
        now_iso = datetime.now(timezone.utc).isoformat()
        await _set_setting(db, "google_reviews_last_refresh", now_iso)
        await db.commit()

    return {
        "inserted": inserted,
        "pages_fetched": pages_fetched,
        "refreshed_at": now_iso,
    }


# ─── endpoints ────────────────────────────────────────────────────────────────

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
        result = await do_refresh()
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
    avg_today  = avg of reviews received today.
    trend_30d  = avg_today - avg(all reviews with iso_date <= now-30d)
    trend_60d  = avg_today - avg(all reviews with iso_date <= now-60d)
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff_30d = now - timedelta(days=30)
    cutoff_60d = now - timedelta(days=60)

    async with AsyncSessionLocal() as db:
        # Overall (total count + global avg for display)
        row0 = await db.execute(
            select(func.avg(GoogleReview.rating).label("avg"), func.count(GoogleReview.id).label("cnt"))
        )
        overall = row0.one()

        # Today's reviews
        row1 = await db.execute(
            select(func.avg(GoogleReview.rating).label("avg"), func.count(GoogleReview.id).label("cnt"))
            .where(GoogleReview.iso_date >= today_start)
        )
        today = row1.one()

        # Avg of last 30 days (excluding today)
        row2 = await db.execute(
            select(func.avg(GoogleReview.rating).label("avg"), func.count(GoogleReview.id).label("cnt"))
            .where(GoogleReview.iso_date >= cutoff_30d)
            .where(GoogleReview.iso_date < today_start)
        )
        last_30d = row2.one()

        # Avg of last 60 days (excluding today)
        row3 = await db.execute(
            select(func.avg(GoogleReview.rating).label("avg"), func.count(GoogleReview.id).label("cnt"))
            .where(GoogleReview.iso_date >= cutoff_60d)
            .where(GoogleReview.iso_date < today_start)
        )
        last_60d = row3.one()

    avg_today = round(float(today.avg), 2) if today.avg else None
    avg_30d = round(float(last_30d.avg), 2) if last_30d.avg else None
    avg_60d = round(float(last_60d.avg), 2) if last_60d.avg else None
    # trend = period_avg - overall_avg  (negative = recent period worse than all-time)
    trend_30d = round(float(last_30d.avg) - float(overall.avg), 2) if last_30d.avg and overall.avg else None
    trend_60d = round(float(last_60d.avg) - float(overall.avg), 2) if last_60d.avg and overall.avg else None

    return {
        "avg_today": avg_today,
        "count_today": today.cnt,
        "avg_overall": round(float(overall.avg), 2) if overall.avg else None,
        "count_overall": overall.cnt,
        "avg_as_of_30d": avg_30d,
        "trend_30d": trend_30d,
        "avg_as_of_60d": avg_60d,
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

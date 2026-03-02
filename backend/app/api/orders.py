"""
Orders — sync OrderProjection history from ERP Prod into local `comenzi` table.

Schedule:
  - 07:00 daily : delete yesterday's rows + full re-fetch for yesterday
  - 11:00–23:00 : hourly incremental sync (newest-first, stop on first existing record)

Initial import: first incremental run on an empty table fetches everything automatically
(stop-on-existing never triggers until all pages are processed).
"""

import asyncio
import httpx
from datetime import datetime, timedelta, timezone, date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, delete, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import or_

from app.core.database import get_db, AsyncSessionLocal
from app.core.security import get_current_user, require_admin
from app.models import Setting, Comanda, ComandaLinie

router = APIRouter(tags=["📋 Orders"])

ERP_URL  = "http://10.170.4.101:5020/api/Entity/Get"
RFC_URL  = "http://10.170.4.101:5020/api/Rfc/Next"
TZ_RO    = timezone(timedelta(hours=2))
BACKFILL_CONCURRENCY = 20

_SELECT_FIELDS = [
    {"name": "CreatedAt_"}, {"name": "Time"}, {"name": "Date"},
    {"name": "JournalRecordDateTime"}, {"name": "OrderInfo"},
    {"name": "ShipToAddressText"}, {"name": "Phone"}, {"name": "Email"},
    {"name": "Number_"}, {"name": "IndexInInterval_"},
    {"name": "Staff_OrderName"}, {"name": "Total_"}, {"name": "Id"},
    {"name": "PayloadAsJson"},
]

# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _read_token(db: AsyncSession) -> str:
    s = (await db.execute(
        select(Setting).where(Setting.cheie == "erp_prod_bearer_token")
    )).scalar_one_or_none()
    return (s.valoare or "") if s else ""


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def _to_kwargs(r: dict) -> dict:
    return {
        "erp_id":            str(r.get("id") or "").strip(),
        "number":            r.get("number_"),
        "index_in_interval": r.get("indexInInterval_"),
        "created_at_erp":    _parse_dt(r.get("createdAt_")),
        "erp_time":          r.get("time"),
        "erp_date":          r.get("date"),
        "journal_dt":        _parse_dt(r.get("journalRecordDateTime")),
        "order_info":        r.get("orderInfo"),
        "ship_to_address":   r.get("shipToAddressText"),
        "phone":             r.get("phone"),
        "email":             r.get("email"),
        "staff_order_name":  r.get("staff_OrderName") or r.get("Staff_OrderName"),
        "total":             r.get("total_"),
        "payload_json":      r.get("payloadAsJson"),
        "synced_at":         datetime.now(TZ_RO),
    }


async def _fetch_order_lines(token: str, erp_id: str) -> list[dict]:
    """Call Rfc/Next → GetOrderRfc to get the full order with orderLine items."""
    payload = {
        "rfcFullTypeName": "HospitalityPlugIn.Rfc.GetOrderRfc",
        "value": {
            "fullTypeName": "",
            "history": None,
            "includeTypeSchema": False,
            "value": {"id": erp_id},
        },
        "interceptorHideSuccessMessages": True,
        "interceptorHideInfoMessages": True,
        "endpoint": "/proxy/http://10.170.4.101:5020//api/Rfc/Next",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            RFC_URL, json=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
    data = resp.json()
    orders_list = ((data.get("result") or {}).get("value") or {}).get("order", [])
    if not orders_list:
        return []
    return orders_list[0].get("orderLine", [])


async def _save_order_lines(db: AsyncSession, comanda: Comanda, lines: list[dict]) -> bool:
    """
    Replace all lines for a comanda. Returns True if header total matches sum of lines.
    Sets comanda.linii_synced = True and comanda.linii_needs_refresh based on mismatch.
    """
    await db.execute(delete(ComandaLinie).where(ComandaLinie.comanda_id == comanda.id))

    lines_total = 0.0
    for line in lines:
        product_def = line.get("productDefinition") or {}
        groups      = product_def.get("productGroup") or []
        product_group = groups[0].get("name") if groups else None
        total_val = float(line.get("total") or 0)
        lines_total += total_val
        db.add(ComandaLinie(
            comanda_id        = comanda.id,
            erp_order_id      = comanda.erp_id,
            line_index        = line.get("lineIndex"),
            product_name      = line.get("productDefinitionDescription"),
            product_group     = product_group,
            quantity          = line.get("quantity"),
            unit_of_measure   = line.get("unitOfMeasureText"),
            unit_price        = line.get("unitPrice"),
            discount_percent  = line.get("discuntPercent"),   # ERP typo
            total             = total_val,
            tax_percent       = line.get("taxPercent"),
            tax_text          = line.get("taxText"),
            order_line_status = line.get("orderLineStatus"),
        ))

    comanda_total = float(comanda.total or 0)
    mismatch = len(lines) > 0 and abs(lines_total - comanda_total) > 0.02
    comanda.linii_synced        = True
    comanda.linii_needs_refresh = False   # resetat după re-fetch; nu mai revine în coadă
    return not mismatch


async def _fetch_lines_for_orders(token: str, orders: list[tuple[int, str]]) -> dict:
    """
    Fetch și salvează liniile pentru o listă de (comanda_id, erp_id).
    Procesează BACKFILL_CONCURRENCY în paralel, secvențial pe batch-uri.
    """
    done = 0
    errors = 0
    for i in range(0, len(orders), BACKFILL_CONCURRENCY):
        batch = orders[i:i + BACKFILL_CONCURRENCY]
        results = await asyncio.gather(
            *[_fetch_and_save_lines(token, cid, eid) for cid, eid in batch],
            return_exceptions=True,
        )
        for ok in results:
            if ok is True:
                done += 1
            else:
                errors += 1
    return {"done": done, "errors": errors}


async def _fetch_and_save_lines(token: str, comanda_id: int, erp_id: str) -> bool:
    """Fetch lines from ERP and save them. Uses own DB session. Returns success bool."""
    try:
        lines = await _fetch_order_lines(token, erp_id)
        async with AsyncSessionLocal() as db:
            comanda = (await db.execute(
                select(Comanda).where(Comanda.id == comanda_id)
            )).scalar_one()
            if comanda.linii_synced and not comanda.linii_needs_refresh:
                return True
            await _save_order_lines(db, comanda, lines)
            await db.commit()
        return True
    except Exception as e:
        print(f"[OrderLines] fetch_and_save error for {erp_id}: {e}")
        return False


# ─── Backfill state ────────────────────────────────────────────────────────────

_backfill_status: dict = {
    "running": False,
    "paused": False,
    "total": 0,
    "done": 0,
    "errors": 0,
    "mismatched": 0,
    "started_at": None,
    "finished_at": None,
    "current_number": None,
}

_backfill_task: asyncio.Task | None = None
_backfill_paused: bool = False


async def _run_backfill() -> None:
    """One-shot backfill: fetch order lines for all pending orders."""
    from app.core.log import write_log
    global _backfill_status, _backfill_paused

    async with AsyncSessionLocal() as db:
        token = await _read_token(db)

    if not token:
        print("[OrderLines] Backfill: token lipsă, anulat")
        _backfill_status["running"] = False
        return

    async with AsyncSessionLocal() as db:
        pending = (await db.execute(
            select(func.count()).select_from(Comanda).where(
                or_(Comanda.linii_synced == False, Comanda.linii_needs_refresh == True)
            )
        )).scalar()

    if not pending:
        print("[OrderLines] Backfill: nimic de procesat")
        _backfill_status.update({"running": False, "finished_at": datetime.now(TZ_RO).isoformat()})
        return

    _backfill_status.update({
        "running": True, "paused": False, "total": pending,
        "done": 0, "errors": 0, "mismatched": 0,
        "started_at": datetime.now(TZ_RO).isoformat(),
        "finished_at": None, "current_number": None,
    })
    print(f"[OrderLines] Backfill pornit: {pending} comenzi de procesat")

    try:
        while True:
            # Pause check
            while _backfill_paused:
                _backfill_status["paused"] = True
                await asyncio.sleep(0.5)
            _backfill_status["paused"] = False

            async with AsyncSessionLocal() as db:
                batch = (await db.execute(
                    select(Comanda.id, Comanda.erp_id, Comanda.number)
                    .where(or_(
                        Comanda.linii_synced == False,
                        Comanda.linii_needs_refresh == True,
                    ))
                    # linii_synced=False (0) vine înainte de True (1) → unsynced au prioritate
                    .order_by(Comanda.linii_synced.asc(), Comanda.number.desc())
                    .limit(BACKFILL_CONCURRENCY)
                )).all()

            if not batch:
                break

            # Comanda cu numărul cel mai mare din batch (procesăm DESC)
            _backfill_status["current_number"] = batch[0].number

            results = await asyncio.gather(
                *[_fetch_and_save_lines(token, c.id, c.erp_id) for c in batch],
                return_exceptions=True,
            )
            for ok in results:
                if ok is True:
                    _backfill_status["done"] += 1
                else:
                    _backfill_status["errors"] += 1

            # Re-query remaining so total stays accurate
            async with AsyncSessionLocal() as db:
                still_pending = (await db.execute(
                    select(func.count()).select_from(Comanda).where(
                        or_(Comanda.linii_synced == False, Comanda.linii_needs_refresh == True)
                    )
                )).scalar() or 0
            _backfill_status["total"] = _backfill_status["done"] + _backfill_status["errors"] + still_pending

            # Invalidează cache predicții la fiecare 2000 comenzi
            done = _backfill_status["done"]
            if done > 0 and done % 2000 < BACKFILL_CONCURRENCY:
                try:
                    from app.api.predictii import _cache as _pred_cache
                    _pred_cache["trained_at"] = None
                    print(f"[OrderLines] Invalidat cache predicții la {done} comenzi procesate")
                except Exception:
                    pass

            await asyncio.sleep(0.1)

        _backfill_status.update({
            "running": False, "paused": False, "current_number": None,
            "finished_at": datetime.now(TZ_RO).isoformat(),
        })
        print(f"[OrderLines] Backfill finalizat: {_backfill_status['done']} ok, {_backfill_status['errors']} erori")
        await write_log("INFO", "order_lines", "Backfill complete", str(_backfill_status))

    except asyncio.CancelledError:
        print("[OrderLines] Backfill anulat")
        _backfill_status.update({"running": False, "paused": False, "current_number": None})
    except Exception as e:
        print(f"[OrderLines] Backfill error: {e}")
        _backfill_status.update({"running": False, "paused": False, "current_number": None})


async def _fetch_page(token: str, skip: int, where: list | None = None) -> list[dict]:
    payload = {
        "dataSetName": "OrderProjection",
        "query": {
            "selectFields": _SELECT_FIELDS,
            "where": where or [],
            "orderBy": [{"fieldName": "Number", "direction": "Desc"}],
            "pagination": {"skip": skip, "take": 5000, "useLastRecords": False},
        },
        "formatOptions": 1,
        "endpoint": "/proxy/http://10.170.4.101:5020//api/Entity/Get",
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            ERP_URL, json=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
    return resp.json().get("results", [])


# ─── Sync functions ───────────────────────────────────────────────────────────

async def _sync_incremental(db: AsyncSession) -> dict:
    """
    Fetch newest orders first (Number DESC). For each record:
    - If not in DB → insert + fetch lines.
    - If already in DB → stop pagination (we've caught up).
    On empty DB: fetches all history page by page.
    """
    from app.core.log import write_log

    token = await _read_token(db)
    if not token:
        return {"error": "Token ERP Prod neconfigurat"}

    skip = 0
    added = 0
    pages = 0
    new_erp_ids: list[str] = []

    while True:
        try:
            results = await _fetch_page(token, skip)
        except Exception as e:
            await write_log("ERROR", "orders_sync", f"Fetch failed at skip={skip}", str(e))
            break

        if not results:
            break

        pages += 1
        stop = False
        page_added = 0

        for r in results:
            erp_id = str(r.get("id") or "").strip()
            if not erp_id:
                continue

            exists = (await db.execute(
                select(Comanda.id).where(Comanda.erp_id == erp_id)
            )).scalar_one_or_none()

            if exists is not None:
                stop = True
                break

            db.add(Comanda(**_to_kwargs(r)))
            new_erp_ids.append(erp_id)
            page_added += 1

        await db.commit()
        added += page_added

        if stop or len(results) < 5000:
            break

        skip += 5000

    # Fetch linii pentru comenzile nou inserate
    lines_done = 0
    lines_errors = 0
    if new_erp_ids:
        async with AsyncSessionLocal() as db2:
            rows = (await db2.execute(
                select(Comanda.id, Comanda.erp_id).where(Comanda.erp_id.in_(new_erp_ids))
            )).all()
        orders = [(r.id, r.erp_id) for r in rows]
        res = await _fetch_lines_for_orders(token, orders)
        lines_done = res["done"]
        lines_errors = res["errors"]
        print(f"[Orders] Incremental: linii {lines_done} ok, {lines_errors} erori")

    return {"added": added, "pages": pages, "lines_done": lines_done, "lines_errors": lines_errors}


async def _sync_yesterday(db: AsyncSession) -> dict:
    """
    Delete all orders for yesterday then re-fetch them from ERP.
    Uses CreatedAt >= yesterday_start filter, then filters client-side to exact day.
    """
    from app.core.log import write_log

    token = await _read_token(db)
    if not token:
        return {"error": "Token ERP Prod neconfigurat"}

    now = datetime.now(TZ_RO)
    yesterday = (now - timedelta(days=1)).date()
    yesterday_start = datetime.combine(yesterday, datetime.min.time()).replace(tzinfo=TZ_RO)
    today_start = datetime.combine(now.date(), datetime.min.time()).replace(tzinfo=TZ_RO)

    # Delete yesterday's rows
    result = await db.execute(
        delete(Comanda).where(
            Comanda.created_at_erp >= yesterday_start,
            Comanda.created_at_erp < today_start,
        )
    )
    deleted = result.rowcount
    await db.commit()

    # Re-fetch — filter by CreatedAt >= yesterday_start in ERP, filter client-side for exact day
    where = [
        {"group": 0, "fieldName": "CreatedAt", "comparator": 4,
         "fieldValue": yesterday_start.isoformat(), "logicOperator": 1},
    ]

    skip = 0
    added = 0

    while True:
        try:
            results = await _fetch_page(token, skip, where=where)
        except Exception as e:
            await write_log("ERROR", "orders_sync", "Yesterday sync fetch failed", str(e))
            break

        if not results:
            break

        for r in results:
            erp_id = str(r.get("id") or "").strip()
            if not erp_id:
                continue
            created = _parse_dt(r.get("createdAt_"))
            if not created or created.astimezone(TZ_RO).date() != yesterday:
                continue
            db.add(Comanda(**_to_kwargs(r)))
            added += 1

        await db.commit()

        if len(results) < 5000:
            break
        skip += 5000

    # Fetch linii pentru toate comenzile re-inserate ale zilei de ieri
    # (CASCADE DELETE a curățat liniile vechi odată cu comenzile șterse)
    lines_done = 0
    lines_errors = 0
    if added > 0:
        async with AsyncSessionLocal() as db2:
            rows = (await db2.execute(
                select(Comanda.id, Comanda.erp_id).where(
                    Comanda.created_at_erp >= yesterday_start,
                    Comanda.created_at_erp < today_start,
                )
            )).all()
        orders = [(r.id, r.erp_id) for r in rows]
        res = await _fetch_lines_for_orders(token, orders)
        lines_done = res["done"]
        lines_errors = res["errors"]
        print(f"[Orders] Yesterday: linii {lines_done} ok, {lines_errors} erori pt {yesterday}")

    return {"deleted": deleted, "added": added, "date": yesterday.isoformat(), "lines_done": lines_done, "lines_errors": lines_errors}


# ─── Background loop ──────────────────────────────────────────────────────────

async def orders_sync_loop() -> None:
    """
    Schedule:
    - 07:00 → delete yesterday + full re-fetch for yesterday
    - 11:00–23:00 hourly → incremental sync (stop on first existing record)
    Checks every 30 seconds; tracks last_hour_ran to avoid double execution.
    """
    from app.core.log import write_log

    print("[Orders] Sync loop started")
    last_hour_ran: int = -1

    while True:
        try:
            await asyncio.sleep(30)

            now = datetime.now(TZ_RO)
            hour = now.hour
            minute = now.minute

            # Only run at top of hour (minute 0–1)
            if minute > 1:
                continue
            if last_hour_ran == hour:
                continue
            last_hour_ran = hour

            if hour == 7:
                print("[Orders] 07:00 — sync yesterday")
                try:
                    async with AsyncSessionLocal() as db:
                        res = await _sync_yesterday(db)
                    print(f"[Orders] Yesterday sync: {res}")
                    await write_log("INFO", "orders_sync", "Yesterday sync OK", str(res))
                except Exception as e:
                    print(f"[Orders] Yesterday sync error: {e}")
                    await write_log("ERROR", "orders_sync", "Yesterday sync failed", str(e))

            elif 11 <= hour <= 23:
                print(f"[Orders] {hour:02d}:00 — incremental sync")
                try:
                    async with AsyncSessionLocal() as db:
                        res = await _sync_incremental(db)
                    print(f"[Orders] Incremental sync: {res}")
                except Exception as e:
                    print(f"[Orders] Incremental sync error: {e}")
                    await write_log("ERROR", "orders_sync", "Incremental sync failed", str(e))

        except asyncio.CancelledError:
            print("[Orders] Sync loop cancelled")
            return
        except Exception as e:
            print(f"[Orders] Loop error: {e}")
            await asyncio.sleep(60)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/orders/sync/incremental")
async def sync_incremental_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Manual trigger: incremental sync (stop on first existing order)."""
    return await _sync_incremental(db)


@router.post("/orders/sync/yesterday")
async def sync_yesterday_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Manual trigger: delete yesterday + full re-fetch."""
    return await _sync_yesterday(db)


@router.get("/orders/count")
async def count_orders(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    total = (await db.execute(select(func.count()).select_from(Comanda))).scalar()
    latest = (await db.execute(
        select(Comanda.number, Comanda.created_at_erp).order_by(Comanda.number.desc()).limit(1)
    )).first()
    return {
        "total": total,
        "latest_number": latest.number if latest else None,
        "latest_date": latest.created_at_erp.isoformat() if latest and latest.created_at_erp else None,
    }


@router.get("/orders/produse")
async def get_top_produse(
    data_start: str = Query(..., description="YYYY-MM-DD"),
    data_end:   str = Query(..., description="YYYY-MM-DD"),
    limit: int  = Query(30, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Top products sold in interval, aggregated from comenzi_linii.
    Only orders that have been line-synced are included.
    """
    from sqlalchemy import text
    try:
        start_dt = datetime.fromisoformat(data_start).replace(
            hour=0, minute=0, second=0, microsecond=0, tzinfo=TZ_RO)
        end_dt = datetime.fromisoformat(data_end).replace(
            hour=23, minute=59, second=59, microsecond=0, tzinfo=TZ_RO)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Format dată invalid")

    rows = (await db.execute(text("""
        SELECT
            cl.product_name,
            cl.product_group,
            SUM(cl.quantity)  AS qty_total,
            SUM(cl.total)     AS val_total,
            COUNT(DISTINCT cl.comanda_id) AS nr_comenzi
        FROM comenzi_linii cl
        JOIN comenzi c ON c.id = cl.comanda_id
        WHERE c.created_at_erp >= :start_dt
          AND c.created_at_erp <= :end_dt
          AND c.linii_synced = TRUE
          AND cl.product_name IS NOT NULL
        GROUP BY cl.product_name, cl.product_group
        ORDER BY qty_total DESC
        LIMIT :limit
    """), {"start_dt": start_dt, "end_dt": end_dt, "limit": limit})).all()

    # Count how many orders in interval have lines synced
    synced = (await db.execute(text("""
        SELECT COUNT(*) FROM comenzi
        WHERE created_at_erp >= :start_dt AND created_at_erp <= :end_dt AND linii_synced = TRUE
    """), {"start_dt": start_dt, "end_dt": end_dt})).scalar()

    total_orders = (await db.execute(text("""
        SELECT COUNT(*) FROM comenzi
        WHERE created_at_erp >= :start_dt AND created_at_erp <= :end_dt
    """), {"start_dt": start_dt, "end_dt": end_dt})).scalar()

    return {
        "produse": [
            {
                "product_name":  r.product_name,
                "product_group": r.product_group,
                "qty_total":     float(r.qty_total or 0),
                "val_total":     round(float(r.val_total or 0), 2),
                "nr_comenzi":    r.nr_comenzi,
            }
            for r in rows
        ],
        "orders_synced":  synced,
        "orders_total":   total_orders,
        "coverage_pct":   round((synced / total_orders * 100) if total_orders else 0, 1),
    }


@router.post("/orders/lines/backfill/start")
async def start_backfill(current_user=Depends(require_admin)):
    """Pornește sau reia backfill-ul liniilor de comandă."""
    global _backfill_task, _backfill_paused

    if _backfill_status.get("running"):
        if _backfill_paused:
            _backfill_paused = False
            return {"status": "resumed"}
        return {"status": "already_running"}

    _backfill_paused = False
    _backfill_task = asyncio.create_task(_run_backfill())
    return {"status": "started"}


@router.post("/orders/lines/backfill/pause")
async def pause_backfill(current_user=Depends(require_admin)):
    """Pauze / reia backfill-ul în curs."""
    global _backfill_paused
    from fastapi import HTTPException

    if not _backfill_status.get("running"):
        raise HTTPException(status_code=400, detail="Backfill nu rulează")

    _backfill_paused = not _backfill_paused
    return {"paused": _backfill_paused}


@router.get("/orders/lines/backfill-status")
async def get_backfill_status(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns current state of the order lines backfill loop + DB-level counts."""
    synced_in_db = (await db.execute(text(
        "SELECT COUNT(*) FROM comenzi WHERE linii_synced = TRUE"
    ))).scalar() or 0
    total_in_db = (await db.execute(text("SELECT COUNT(*) FROM comenzi"))).scalar() or 0
    return {**_backfill_status, "synced_in_db": synced_in_db, "total_in_db": total_in_db}


@router.get("/orders/lines/{erp_id}")
async def get_order_lines(
    erp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return cached order lines for a given erp_id. Returns [] if not yet synced."""
    comanda = (await db.execute(
        select(Comanda).where(Comanda.erp_id == erp_id)
    )).scalar_one_or_none()
    if not comanda:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Comanda negăsită")

    lines = (await db.execute(
        select(ComandaLinie)
        .where(ComandaLinie.comanda_id == comanda.id)
        .order_by(ComandaLinie.line_index)
    )).scalars().all()

    return {
        "erp_id": erp_id,
        "linii_synced": comanda.linii_synced,
        "linii_needs_refresh": comanda.linii_needs_refresh,
        "comanda_total": float(comanda.total or 0),
        "lines": [
            {
                "line_index":        l.line_index,
                "product_name":      l.product_name,
                "product_group":     l.product_group,
                "quantity":          float(l.quantity or 0),
                "unit_of_measure":   l.unit_of_measure,
                "unit_price":        float(l.unit_price or 0),
                "discount_percent":  float(l.discount_percent or 0),
                "total":             float(l.total or 0),
                "tax_percent":       float(l.tax_percent or 0),
                "tax_text":          l.tax_text,
                "order_line_status": l.order_line_status,
            }
            for l in lines
        ],
    }


@router.post("/orders/lines/fetch/{erp_id}")
async def fetch_order_lines_now(
    erp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Manually trigger line fetch for a single order."""
    comanda = (await db.execute(
        select(Comanda).where(Comanda.erp_id == erp_id)
    )).scalar_one_or_none()
    if not comanda:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Comanda negăsită")

    token = await _read_token(db)
    if not token:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Token ERP Prod neconfigurat")

    lines = await _fetch_order_lines(token, erp_id)
    matched = await _save_order_lines(db, comanda, lines)
    await db.commit()
    return {"lines_count": len(lines), "total_match": matched}


@router.get("/orders")
async def list_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    phone: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    stmt = select(Comanda).order_by(Comanda.number.desc())
    if phone:
        stmt = stmt.where(Comanda.phone.ilike(f"%{phone.strip()}%"))
    if q:
        s = f"%{q.strip()}%"
        from sqlalchemy import or_
        stmt = stmt.where(or_(
            Comanda.phone.ilike(s),
            Comanda.ship_to_address.ilike(s),
            Comanda.staff_order_name.ilike(s),
            Comanda.email.ilike(s),
        ))
    if date_from:
        try:
            dt = datetime.fromisoformat(date_from).replace(tzinfo=TZ_RO)
            stmt = stmt.where(Comanda.created_at_erp >= dt)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59, tzinfo=TZ_RO)
            stmt = stmt.where(Comanda.created_at_erp <= dt)
        except ValueError:
            pass

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar()
    rows = (await db.execute(stmt.offset(skip).limit(limit))).scalars().all()

    return {
        "orders": [
            {
                "id": r.id,
                "erp_id": r.erp_id,
                "number": r.number,
                "created_at_erp": r.created_at_erp.isoformat() if r.created_at_erp else None,
                "erp_date": r.erp_date,
                "erp_time": r.erp_time,
                "ship_to_address": r.ship_to_address,
                "phone": r.phone,
                "email": r.email,
                "total": float(r.total) if r.total is not None else None,
                "staff_order_name": r.staff_order_name,
                "order_info": r.order_info,
                "index_in_interval": r.index_in_interval,
                "synced_at": r.synced_at.isoformat() if r.synced_at else None,
            }
            for r in rows
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from datetime import datetime, timezone, timedelta, date as date_type
from collections import defaultdict
import asyncio
import httpx

from app.core.database import get_db, AsyncSessionLocal
from app.core.security import get_current_user
from app.models import User, Setting, MapPin, Geofence, Comanda, ComandaStatusHistory
from app.api.geocoding import geocode_one, clean_address, travel_time_from_restaurant, save_geocode_override

router = APIRouter(tags=["📦 Comenzi"])

PREP_MIN = 20  # preparation time in minutes


TZ_RO = timezone(timedelta(hours=2))


def _fmt_eta(created_at_str: str | None, travel_min: float | None) -> tuple[str | None, str | None]:
    """(eta_delivery HH:MM, eta_return HH:MM) or (None, None) on failure."""
    if not created_at_str or travel_min is None:
        return None, None
    try:
        ts = created_at_str.replace("Z", "+00:00")
        created = datetime.fromisoformat(ts)
        tm = round(travel_min)
        eta_del = created + timedelta(minutes=PREP_MIN + tm)
        eta_ret = eta_del + timedelta(minutes=tm)
        fmt = lambda d: d.strftime("%H:%M")
        return fmt(eta_del), fmt(eta_ret)
    except Exception:
        return None, None

ERP_URL = "http://10.170.4.101:5020/api/Entity/Get"
DISTRIBUTION_CHANNEL_ID = "17bf6713-e407-4bc9-9640-29c0f307c303"

STATUS_MAP = {
    1:   {"label": "Nouă",           "color": "blue"},
    2:   {"label": "În așteptare",   "color": "orange"},
    4:   {"label": "Confirmată",     "color": "orange"},
    16:  {"label": "Pregătită",      "color": "orange"},
    32:  {"label": "În livrare",     "color": "blue"},
    256: {"label": "Așteaptă plata",  "color": "orange"},
    512: {"label": "Livrată",        "color": "green"},
}

# ERP returns string labels when formatOptions=1 — map back to int codes
_ERP_STRING_TO_INT = {
    "New":            1,
    "WaitingPayment": 2,
    "Confirmed":      4,
    "Prepared":       16,
    "InDelivery":     32,
    "Problem":        256,
    "Delivered":      512,
}


def _is_ridicare(address: str) -> bool:
    return "RIDICARE" in (address or "").upper()


async def _read_erp_prod_token(db: AsyncSession) -> str:
    s = (await db.execute(select(Setting).where(Setting.cheie == "erp_prod_bearer_token"))).scalar_one_or_none()
    return (s.valoare or "") if s else ""


async def _fetch_comenzi_erp(token: str) -> list[dict]:
    tz_ro = timezone(timedelta(hours=2))
    today_start = datetime.now(tz_ro).replace(hour=0, minute=0, second=0, microsecond=0)

    payload = {
        "dataSetName": "DistributionChannelOrderProjection",
        "query": {
            "selectFields": [
                {"name": "Time"}, {"name": "Date"}, {"name": "CustomerName_"},
                {"name": "ShipToAddressText"}, {"name": "Phone"},
                {"name": "IndexInInterval_"}, {"name": "Total_"}, {"name": "Id"},
                {"name": "PayloadAsJson"}, {"name": "CreatedAt_"},
                {"name": "BusinessPartnerId_"}, {"name": "Number_"},
                {"name": "OrderStatus_"}, {"name": "JournalRecordDateTime"},
            ],
            "where": [
                {"group": 0, "fieldName": "DistributionChannelId", "comparator": 3,
                 "fieldValue": DISTRIBUTION_CHANNEL_ID, "logicOperator": 1},
                {"group": 0, "fieldName": "CreatedAt", "comparator": 4,
                 "fieldValue": today_start.isoformat(), "logicOperator": 2},
                {"group": 1, "fieldName": "OrderStatus_", "comparator": 3, "fieldValue": 1,   "logicOperator": 2},
                {"group": 0, "fieldName": "OrderStatus_", "comparator": 3, "fieldValue": 4,   "logicOperator": 2},
                {"group": 0, "fieldName": "OrderStatus_", "comparator": 3, "fieldValue": 2,   "logicOperator": 2},
                {"group": 0, "fieldName": "OrderStatus_", "comparator": 3, "fieldValue": 16,  "logicOperator": 2},
                {"group": 0, "fieldName": "OrderStatus_", "comparator": 3, "fieldValue": 32,  "logicOperator": 2},
                {"group": 0, "fieldName": "OrderStatus_", "comparator": 3, "fieldValue": 256, "logicOperator": 2},
                {"group": 2, "fieldName": "OrderStatus_", "comparator": 3, "fieldValue": 512, "logicOperator": 1},
            ],
            "orderBy": [{"fieldName": "Number", "direction": "Desc"}],
            "pagination": {"skip": 0, "take": 200, "useLastRecords": False},
        },
        "formatOptions": 1,
        "endpoint": "/proxy/http://10.170.4.101:5020//api/Entity/Get",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            ERP_URL,
            json=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
    return resp.json().get("results", [])




# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/comenzi/azi")
async def get_comenzi_azi(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = await _read_erp_prod_token(db)
    if not token:
        raise HTTPException(status_code=400, detail="Token ERP Prod neconfigurat în Settings → Keys.")
    try:
        results = await _fetch_comenzi_erp(token)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Eroare ERP ({e.response.status_code}): {e.response.text[:200]}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Eroare conectare ERP: {str(e)}")

    comenzi = []
    for r in results:
        status_raw = r.get("orderStatus_", 0)
        # ERP returns string labels when formatOptions=1 — normalize to int
        status = _ERP_STRING_TO_INT.get(status_raw, status_raw) if isinstance(status_raw, str) else status_raw
        info = STATUS_MAP.get(status, {"label": str(status_raw), "color": "blue"})
        comenzi.append({
            "id":            r.get("id"),
            "number":        r.get("number_"),
            "time":          r.get("time"),
            "customer_name": r.get("customerName_"),
            "address":       r.get("shipToAddressText"),
            "phone":         r.get("phone"),
            "total":         r.get("total_"),
            "status":        status,
            "status_label":  info["label"],
            "status_color":  info["color"],
            "is_ridicare":   _is_ridicare(r.get("shipToAddressText", "")),
            "created_at":    r.get("createdAt_"),
            # filled below after geocode join
            "lat": None, "lng": None,
            "travel_time_min": None, "eta_delivery": None, "eta_return": None,
        })

    # ── Join with map_pins to get coordinates ────────────────────────────────
    livrari_idx = [i for i, c in enumerate(comenzi) if not c["is_ridicare"]]
    if livrari_idx:
        names = [comenzi[i]["customer_name"].lower() for i in livrari_idx if comenzi[i]["customer_name"]]
        pins_q = await db.execute(
            select(MapPin).where(
                MapPin.permanent.isnot(True),
                func.lower(MapPin.name).in_(names),
            )
        )
        # Group by name — multiple pins can share a name (same customer, different address)
        pins_by_name: dict[str, list] = {}
        for p in pins_q.scalars().all():
            key = p.name.lower()
            pins_by_name.setdefault(key, []).append(p)

        def _addr_score(pin_addr: str, order_addr: str) -> int:
            """Count shared words between two cleaned addresses (case-insensitive)."""
            a = set((pin_addr or "").lower().split())
            b = set((order_addr or "").lower().split())
            return len(a & b)

        for i in livrari_idx:
            candidates = pins_by_name.get((comenzi[i]["customer_name"] or "").lower(), [])
            if not candidates:
                continue
            # If multiple pins share the name, pick the one whose address best matches
            if len(candidates) == 1:
                pin = candidates[0]
            else:
                order_addr = clean_address(comenzi[i]["address"] or "")
                pin = max(candidates, key=lambda p: _addr_score(p.address or "", order_addr))
            tm = float(pin.travel_time_min) if pin.travel_time_min is not None else None
            comenzi[i]["lat"] = float(pin.lat)
            comenzi[i]["lng"] = float(pin.lng)
            comenzi[i]["travel_time_min"] = round(tm) if tm is not None else None
            eta_d, eta_r = _fmt_eta(comenzi[i]["created_at"], tm)
            comenzi[i]["eta_delivery"] = eta_d
            comenzi[i]["eta_return"] = eta_r

    return {"comenzi": comenzi, "total": len(comenzi)}


@router.post("/comenzi/marcare-harta-toate")
async def marcare_harta_toate(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Șterge toți pinii vechi, geocodează toate livrările de azi și le adaugă pe hartă."""
    token = await _read_erp_prod_token(db)
    if not token:
        raise HTTPException(status_code=400, detail="Token ERP Prod neconfigurat.")

    try:
        results = await _fetch_comenzi_erp(token)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    livrari = [r for r in results if not _is_ridicare(r.get("shipToAddressText", ""))]

    # Șterge doar pinii non-permanenți (permanent IS NOT TRUE prinde și NULL)
    await db.execute(delete(MapPin).where(MapPin.permanent.isnot(True)))
    await db.commit()

    added, failed = 0, []
    for r in livrari:
        address = (r.get("shipToAddressText") or "").strip()
        name = (r.get("customerName_") or "").strip()
        if not address or not name:
            continue

        coords = await geocode_one(address, db, name_hint=name)
        if coords:
            lat, lng = coords
            tm = await travel_time_from_restaurant(lat, lng, db)
            status_raw = r.get("orderStatus_", 0)
            status = _ERP_STRING_TO_INT.get(status_raw, status_raw) if isinstance(status_raw, str) else status_raw
            info = STATUS_MAP.get(status, {"label": str(status_raw), "color": "blue"})
            pin = MapPin(
                name=name,
                address=clean_address(address),
                lat=lat, lng=lng,
                color=info["color"],
                note=info["label"],
                travel_time_min=tm,
            )
            db.add(pin)
            await db.flush()
            db.add(Geofence(map_pin_id=pin.id, lat=lat, lng=lng, radius_m=100))
            added += 1
        else:
            failed.append(name)

        await asyncio.sleep(1)  # rate limit safety (Nominatim: 1 req/sec)

    await db.commit()
    return {"added": added, "failed": failed, "total_livrari": len(livrari)}


async def _do_sync_harta(db: AsyncSession) -> dict:
    """Core logic: upsert map pins from today's ERP delivery orders."""
    token = await _read_erp_prod_token(db)
    if not token:
        return {"error": "Token ERP Prod neconfigurat"}

    try:
        results = await _fetch_comenzi_erp(token)
    except Exception as e:
        return {"error": str(e)}

    livrari = [r for r in results if not _is_ridicare(r.get("shipToAddressText", ""))]

    added = 0
    updated = 0
    unchanged = 0
    failed = []

    all_pins_q = await db.execute(select(MapPin).where(MapPin.permanent.isnot(True)))
    pins_by_name: dict[str, list] = {}
    for p in all_pins_q.scalars().all():
        pins_by_name.setdefault(p.name.lower(), []).append(p)

    def _addr_score(pin_addr: str, order_addr: str) -> int:
        return len(set((pin_addr or "").lower().split()) & set((order_addr or "").lower().split()))

    for r in livrari:
        address = (r.get("shipToAddressText") or "").strip()
        name = (r.get("customerName_") or "").strip()
        if not address or not name:
            continue

        name_key = name.lower()
        clean_addr = clean_address(address)
        status_raw = r.get("orderStatus_", 0)
        status = _ERP_STRING_TO_INT.get(status_raw, status_raw) if isinstance(status_raw, str) else status_raw
        info = STATUS_MAP.get(status, {"label": str(status_raw), "color": "blue"})
        new_color = info["color"]
        new_note = info["label"]

        candidates = pins_by_name.get(name_key, [])
        if candidates:
            existing = max(candidates, key=lambda p: _addr_score(p.address or "", clean_addr))
            if existing.color != new_color or existing.note != new_note:
                existing.color = new_color
                existing.note = new_note
                updated += 1
            else:
                unchanged += 1
        else:
            coords = await geocode_one(address, db, name_hint=name)
            if coords:
                lat, lng = coords
                tm = await travel_time_from_restaurant(lat, lng, db)
                new_pin = MapPin(
                    name=name,
                    address=clean_addr,
                    lat=lat, lng=lng,
                    color=new_color,
                    note=new_note,
                    travel_time_min=tm,
                )
                db.add(new_pin)
                pins_by_name.setdefault(name_key, []).append(new_pin)
                added += 1
                await asyncio.sleep(0.5)
            else:
                failed.append(name)

    await db.commit()
    await _record_status_changes(db, results)
    return {"added": added, "updated": updated, "unchanged": unchanged, "failed": failed}


async def _record_status_changes(db: AsyncSession, results: list[dict]) -> None:
    """Detect status changes from ERP results and insert into comenzi_status_history."""
    if not results:
        return
    erp_ids = [r.get("id") for r in results if r.get("id")]
    if not erp_ids:
        return

    # Last recorded status per erp_id
    from sqlalchemy import text as _text
    last_rows = (await db.execute(
        _text(
            "SELECT DISTINCT ON (erp_id) erp_id, status "
            "FROM comenzi_status_history "
            "WHERE erp_id = ANY(:ids) "
            "ORDER BY erp_id, recorded_at DESC"
        ),
        {"ids": erp_ids},
    )).all()
    last_status_map = {row.erp_id: row.status for row in last_rows}

    new_entries = []
    status_updates = []  # (erp_id, status)

    for r in results:
        erp_id = r.get("id")
        if not erp_id:
            continue
        status_raw = r.get("orderStatus_", 0)
        status = _ERP_STRING_TO_INT.get(status_raw, status_raw) if isinstance(status_raw, str) else status_raw
        if not isinstance(status, int):
            continue

        is_ridicare = _is_ridicare(r.get("shipToAddressText", ""))
        number = r.get("number_")

        # Parse erp_time from Date + Time fields
        erp_time_dt = None
        try:
            date_str = (r.get("date") or r.get("Date") or "").strip()
            time_str = (r.get("time") or r.get("Time") or "").strip()
            if date_str and time_str:
                erp_time_dt = datetime.fromisoformat(f"{date_str}T{time_str}").replace(tzinfo=TZ_RO)
        except Exception:
            pass

        last = last_status_map.get(erp_id)
        if last is None or last != status:
            new_entries.append(ComandaStatusHistory(
                erp_id=erp_id,
                number=number,
                status=status,
                is_ridicare=is_ridicare,
                erp_time=erp_time_dt,
            ))
            status_updates.append((erp_id, status))

    if new_entries:
        db.add_all(new_entries)

    # Bulk update current_status on comenzi rows
    if status_updates:
        for erp_id, status in status_updates:
            await db.execute(
                _text("UPDATE comenzi SET current_status = :s WHERE erp_id = :eid"),
                {"s": status, "eid": erp_id},
            )

    try:
        await db.commit()
    except Exception:
        await db.rollback()


async def sync_harta_loop() -> None:
    """Background task: auto-sync delivery pins every 10 min during 10:00–23:00."""
    print("[SyncHarta] Auto-sync loop started")
    while True:
        try:
            await asyncio.sleep(600)  # 10 minutes
            now = datetime.now(TZ_RO)
            if 10 <= now.hour <= 23:
                async with AsyncSessionLocal() as db:
                    res = await _do_sync_harta(db)
                if "error" not in res:
                    print(f"[SyncHarta] Auto: +{res['added']} new, {res['updated']} updated, {res['unchanged']} unchanged")
        except asyncio.CancelledError:
            print("[SyncHarta] Auto-sync loop stopped")
            return
        except Exception as e:
            print(f"[SyncHarta] Loop error: {e}")
            await asyncio.sleep(60)


@router.post("/comenzi/sync-harta")
async def sync_harta(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upsert map pins from today's ERP orders: add new, update color/status on existing."""
    result = await _do_sync_harta(db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/comenzi/analiza")
async def analiza_comenzi(
    data_start: str = Query(..., description="YYYY-MM-DD"),
    data_end: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregated order analysis from local comenzi table."""
    try:
        start_dt = datetime.fromisoformat(data_start).replace(
            hour=0, minute=0, second=0, microsecond=0, tzinfo=TZ_RO,
        )
        end_dt = datetime.fromisoformat(data_end).replace(
            hour=23, minute=59, second=59, microsecond=0, tzinfo=TZ_RO,
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Format dată invalid. Folosiți YYYY-MM-DD.")

    rows = (await db.execute(
        select(Comanda).where(
            Comanda.created_at_erp >= start_dt,
            Comanda.created_at_erp <= end_dt,
        )
    )).scalars().all()

    db_count = (await db.execute(select(func.count()).select_from(Comanda))).scalar()

    if not rows:
        empty_hours = [{"ora": h, "count": 0} for h in range(24)]
        empty_livrare = [{"ora": h, "livrare": 0, "ridicare": 0} for h in range(24)]
        empty_livrare_val = [{"ora": h, "livrare": 0.0, "ridicare": 0.0} for h in range(24)]
        return {
            "total": 0, "dinein": 0, "livrare": 0, "ridicare": 0,
            "valoare_totala": 0.0, "valoare_medie": 0.0,
            "by_hour_dinein": empty_hours,
            "by_hour_livrare": empty_livrare,
            "by_hour_dinein_val": [{"ora": h, "valoare": 0.0} for h in range(24)],
            "by_hour_livrare_val": empty_livrare_val,
            "by_date": [],
            "db_count": db_count,
        }

    def _categorize(ship: str, info: str) -> str:
        ship = (ship or "").strip()
        info = (info or "")
        if "RIDICARE" in ship.upper():
            return "ridicare"
        if "Table:" in info:
            return "dine-in"
        return "livrare"

    orders = []
    for r in rows:
        created = r.created_at_erp.astimezone(TZ_RO) if r.created_at_erp else None
        if not created:
            continue
        cat = _categorize(r.ship_to_address or "", r.order_info or "")
        orders.append({
            "cat": cat,
            "total": float(r.total or 0),
            "hour": created.hour,
            "date": created.date().isoformat(),
        })

    total_count = len(orders)
    dinein   = sum(1 for o in orders if o["cat"] == "dine-in")
    livrare  = sum(1 for o in orders if o["cat"] == "livrare")
    ridicare = sum(1 for o in orders if o["cat"] == "ridicare")
    valoare_totala = sum(o["total"] for o in orders)
    valoare_medie  = round(valoare_totala / total_count, 2) if total_count else 0

    # By hour — counts and values
    dinein_h:       dict = defaultdict(int)
    livrare_h:      dict = defaultdict(int)
    ridicare_h:     dict = defaultdict(int)
    dinein_val_h:   dict = defaultdict(float)
    livrare_val_h:  dict = defaultdict(float)
    ridicare_val_h: dict = defaultdict(float)
    for o in orders:
        h = o["hour"]
        if o["cat"] == "dine-in":
            dinein_h[h] += 1
            dinein_val_h[h] += o["total"]
        elif o["cat"] == "livrare":
            livrare_h[h] += 1
            livrare_val_h[h] += o["total"]
        else:
            ridicare_h[h] += 1
            ridicare_val_h[h] += o["total"]

    by_hour_dinein      = [{"ora": h, "count": dinein_h.get(h, 0)} for h in range(24)]
    by_hour_livrare     = [{"ora": h, "livrare": livrare_h.get(h, 0), "ridicare": ridicare_h.get(h, 0)} for h in range(24)]
    by_hour_dinein_val  = [{"ora": h, "valoare": round(dinein_val_h.get(h, 0), 2)} for h in range(24)]
    by_hour_livrare_val = [{"ora": h, "livrare": round(livrare_val_h.get(h, 0), 2), "ridicare": round(ridicare_val_h.get(h, 0), 2)} for h in range(24)]

    # By date
    date_counts: dict = defaultdict(lambda: {"count": 0, "valoare": 0.0})
    for o in orders:
        date_counts[o["date"]]["count"] += 1
        date_counts[o["date"]]["valoare"] += o["total"]
    by_date = [
        {"data": d, "count": v["count"], "valoare": round(v["valoare"], 2)}
        for d, v in sorted(date_counts.items())
    ]

    return {
        "total": total_count,
        "dinein": dinein,
        "livrare": livrare,
        "ridicare": ridicare,
        "valoare_totala": round(valoare_totala, 2),
        "valoare_medie": valoare_medie,
        "by_hour_dinein": by_hour_dinein,
        "by_hour_livrare": by_hour_livrare,
        "by_hour_dinein_val": by_hour_dinein_val,
        "by_hour_livrare_val": by_hour_livrare_val,
        "by_date": by_date,
        "db_count": db_count,
    }


@router.post("/comenzi/marcare-pin")
async def marcare_pin_individual(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Geocodează și adaugă pe hartă o singură comandă."""
    address = (data.get("address") or "").strip()
    name = (data.get("customer_name") or "").strip()
    color = data.get("color", "blue")
    original_address = (data.get("original_address") or "").strip()

    if not address or not name:
        raise HTTPException(status_code=400, detail="Adresa și numele sunt obligatorii.")
    if _is_ridicare(address):
        raise HTTPException(status_code=400, detail="Comanda este RIDICARE.")

    coords = await geocode_one(address, db, name_hint=name)
    if not coords:
        raise HTTPException(status_code=422, detail=f"Adresa nu a putut fi geocodată: {address}")

    lat, lng = coords
    tm = await travel_time_from_restaurant(lat, lng, db)
    note = data.get("note")  # status label trimis din frontend
    pin = MapPin(name=name, address=clean_address(address), lat=lat, lng=lng, color=color, note=note, travel_time_min=tm)
    db.add(pin)
    await db.flush()

    db.add(Geofence(map_pin_id=pin.id, lat=lat, lng=lng, radius_m=100))
    await db.commit()
    await db.refresh(pin)

    # Save override keyed by original ERP address so future geocoding skips external APIs
    if original_address and original_address != address:
        await save_geocode_override(db, original_address, lat, lng)

    return {"id": pin.id, "lat": float(pin.lat), "lng": float(pin.lng)}


@router.get("/comenzi/timing")
async def get_comenzi_timing(
    date: str = Query(None, description="YYYY-MM-DD (implicit azi)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return orders with full status history for timeline visualization."""
    from sqlalchemy import text as _text

    today_str = datetime.now(TZ_RO).date().isoformat()
    target_date = date or today_str
    is_today = target_date == today_str

    # If today → fetch live from ERP, record changes, and collect live journal_dt values
    live_journal_map: dict[str, str] = {}
    if is_today:
        token = await _read_erp_prod_token(db)
        if token:
            try:
                results = await _fetch_comenzi_erp(token)
                await _record_status_changes(db, results)
                for r in results:
                    erp_id = r.get("id")
                    jrd = r.get("journalRecordDateTime") or r.get("JournalRecordDateTime")
                    if erp_id and jrd:
                        live_journal_map[erp_id] = jrd
            except Exception:
                pass

    # Build date range (ERP day = 07:00–06:59 next day; use calendar day for simplicity)
    try:
        day_start = datetime.fromisoformat(target_date).replace(hour=0, minute=0, second=0, tzinfo=TZ_RO)
        day_end   = day_start + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Format dată invalid.")

    # Load orders from DB
    orders_q = (await db.execute(
        select(Comanda).where(
            Comanda.created_at_erp >= day_start,
            Comanda.created_at_erp < day_end,
        ).order_by(Comanda.created_at_erp.desc())
    )).scalars().all()

    erp_ids = [o.erp_id for o in orders_q]

    # Load all history entries for these orders
    history_rows = []
    if erp_ids:
        history_rows = (await db.execute(
            select(ComandaStatusHistory)
            .where(ComandaStatusHistory.erp_id.in_(erp_ids))
            .order_by(ComandaStatusHistory.erp_id, ComandaStatusHistory.erp_time, ComandaStatusHistory.recorded_at)
        )).scalars().all()

    from collections import defaultdict as _dd
    hist_by_erp: dict[str, list] = _dd(list)
    for h in history_rows:
        hist_by_erp[h.erp_id].append({
            "status": h.status,
            "erp_time": h.erp_time.isoformat() if h.erp_time else None,
            "recorded_at": h.recorded_at.isoformat() if h.recorded_at else None,
        })

    orders = []
    for o in orders_q:
        # Use DB journal_dt; fall back to live ERP value for today's unsynced orders
        journal_dt_val: str | None = None
        if o.journal_dt:
            journal_dt_val = o.journal_dt.isoformat()
        elif o.erp_id in live_journal_map:
            raw = live_journal_map[o.erp_id]
            try:
                # Normalize to ISO with timezone
                parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=TZ_RO)
                journal_dt_val = parsed.isoformat()
            except Exception:
                journal_dt_val = raw

        orders.append({
            "erp_id":        o.erp_id,
            "number":        o.number,
            "customer_name": o.ship_to_address.split(",")[0].strip() if o.ship_to_address and _is_ridicare(o.ship_to_address) else (o.staff_order_name or o.erp_id),
            "address":       o.ship_to_address or "",
            "is_ridicare":   _is_ridicare(o.ship_to_address or ""),
            "created_at":    o.created_at_erp.isoformat() if o.created_at_erp else None,
            "journal_dt":    journal_dt_val,
            "erp_time":      o.erp_time,
            "erp_date":      o.erp_date,
            "current_status": o.current_status,
            "history":       hist_by_erp.get(o.erp_id, []),
        })

    return {"orders": orders, "date": target_date}


@router.post("/comenzi/timing/backfill")
async def backfill_timing(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Seed comenzi_status_history for orders that have no entries yet."""
    from sqlalchemy import text as _text

    # Find orders with no history entries
    rows = (await db.execute(
        _text(
            "SELECT c.erp_id, c.number, c.ship_to_address, c.created_at_erp, "
            "       c.erp_date, c.erp_time, c.current_status "
            "FROM comenzi c "
            "LEFT JOIN comenzi_status_history csh ON csh.erp_id = c.erp_id "
            "WHERE csh.id IS NULL"
        )
    )).all()

    seeded = 0
    for row in rows:
        is_ridicare = _is_ridicare(row.ship_to_address or "")
        erp_id = row.erp_id
        number = row.number

        # Initial status: Nouă at created_at_erp
        entry = ComandaStatusHistory(
            erp_id=erp_id,
            number=number,
            status=1,
            is_ridicare=is_ridicare,
            erp_time=row.created_at_erp,
        )
        db.add(entry)
        seeded += 1

        # If current_status is known and different from 1, add final status entry
        if row.current_status and row.current_status != 1:
            final_ts = None
            try:
                if row.erp_date and row.erp_time:
                    final_ts = datetime.fromisoformat(f"{row.erp_date}T{row.erp_time}").replace(tzinfo=TZ_RO)
            except Exception:
                pass
            db.add(ComandaStatusHistory(
                erp_id=erp_id,
                number=number,
                status=row.current_status,
                is_ridicare=is_ridicare,
                erp_time=final_ts,
            ))

    await db.commit()
    return {"seeded": seeded}

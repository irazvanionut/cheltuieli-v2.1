from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from datetime import datetime, timezone, timedelta
import asyncio
import httpx

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User, Setting, MapPin
from app.api.geocoding import geocode_one, clean_address, travel_time_from_restaurant

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
    256: {"label": "Problemă",       "color": "red"},
    512: {"label": "Livrată",        "color": "green"},
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
                {"name": "OrderStatus_"},
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
        status = r.get("orderStatus_", 0)
        info = STATUS_MAP.get(status, {"label": str(status), "color": "blue"})
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
        pins_by_name = {p.name.lower(): p for p in pins_q.scalars().all()}

        for i in livrari_idx:
            pin = pins_by_name.get((comenzi[i]["customer_name"] or "").lower())
            if not pin:
                continue
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

        coords = await geocode_one(address, db)
        if coords:
            lat, lng = coords
            tm = await travel_time_from_restaurant(lat, lng, db)
            status = r.get("orderStatus_", 0)
            info = STATUS_MAP.get(status, {"label": str(status), "color": "blue"})
            db.add(MapPin(
                name=name,
                address=clean_address(address),
                lat=lat, lng=lng,
                color=info["color"],
                note=info["label"],
                travel_time_min=tm,
            ))
            added += 1
        else:
            failed.append(name)

        await asyncio.sleep(1)  # rate limit safety (Nominatim: 1 req/sec)

    await db.commit()
    return {"added": added, "failed": failed, "total_livrari": len(livrari)}


@router.post("/comenzi/sync-harta")
async def sync_harta(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upsert map pins from today's ERP orders: add new, update color/status on existing."""
    token = await _read_erp_prod_token(db)
    if not token:
        raise HTTPException(status_code=400, detail="Token ERP Prod neconfigurat.")

    try:
        results = await _fetch_comenzi_erp(token)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    livrari = [r for r in results if not _is_ridicare(r.get("shipToAddressText", ""))]

    added = 0
    updated = 0
    unchanged = 0
    failed = []
    # ERP results are newest-first; track processed names to avoid duplicate updates
    processed: set[str] = set()

    for r in livrari:
        address = (r.get("shipToAddressText") or "").strip()
        name = (r.get("customerName_") or "").strip()
        if not address or not name:
            continue

        name_key = name.lower()
        if name_key in processed:
            continue
        processed.add(name_key)

        status = r.get("orderStatus_", 0)
        info = STATUS_MAP.get(status, {"label": str(status), "color": "blue"})
        new_color = info["color"]
        new_note = info["label"]

        existing = (await db.execute(
            select(MapPin).where(func.lower(MapPin.name) == name_key)
        )).scalars().first()

        if existing:
            if existing.color != new_color or existing.note != new_note:
                existing.color = new_color
                existing.note = new_note
                updated += 1
            else:
                unchanged += 1
        else:
            coords = await geocode_one(address, db)
            if coords:
                lat, lng = coords
                tm = await travel_time_from_restaurant(lat, lng, db)
                db.add(MapPin(
                    name=name,
                    address=clean_address(address),
                    lat=lat, lng=lng,
                    color=new_color,
                    note=new_note,
                    travel_time_min=tm,
                ))
                added += 1
                await asyncio.sleep(1)
            else:
                failed.append(name)

    await db.commit()
    return {"added": added, "updated": updated, "unchanged": unchanged, "failed": failed}


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

    if not address or not name:
        raise HTTPException(status_code=400, detail="Adresa și numele sunt obligatorii.")
    if _is_ridicare(address):
        raise HTTPException(status_code=400, detail="Comanda este RIDICARE.")

    coords = await geocode_one(address, db)
    if not coords:
        raise HTTPException(status_code=422, detail=f"Adresa nu a putut fi geocodată: {address}")

    lat, lng = coords
    tm = await travel_time_from_restaurant(lat, lng, db)
    note = data.get("note")  # status label trimis din frontend
    pin = MapPin(name=name, address=clean_address(address), lat=lat, lng=lng, color=color, note=note, travel_time_min=tm)
    db.add(pin)
    await db.commit()
    await db.refresh(pin)
    return {"id": pin.id, "lat": float(pin.lat), "lng": float(pin.lng)}

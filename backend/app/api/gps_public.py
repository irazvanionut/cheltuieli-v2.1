"""Public (no-auth) GPS endpoints for the NavigatieGPS page — shareable direct link."""

from fastapi import APIRouter, Depends
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import date
import httpx

from app.core.database import get_db
from app.models import Setting, MapPin
from app.api.navigatie import _get_setting
from app.api.geocoding import google_maps_enabled
from app.api.comenzi import (
    _read_erp_prod_token, _fetch_comenzi_erp,
    _is_ridicare, STATUS_MAP, _fmt_eta,
)
from app.api.geocoding import geocode_one, travel_time_from_restaurant, clean_address

router = APIRouter(tags=["🌐 GPS Public"], prefix="/public/gps")


@router.get("/settings")
async def public_gps_settings(db: AsyncSession = Depends(get_db)):
    """Return non-sensitive GPS settings (no API keys exposed)."""
    api_key = await _get_setting(db, "google_maps_api_key")
    enabled = await google_maps_enabled(db)
    return {"has_maps_key": bool(api_key) and enabled}


@router.get("/maps-js")
async def public_gps_maps_js(db: AsyncSession = Depends(get_db)):
    """Proxy the Google Maps JS loader — key stays on the server."""
    if not await google_maps_enabled(db):
        return Response(
            content="// Google Maps API calls are disabled by administrator.",
            media_type="application/javascript",
        )
    api_key = await _get_setting(db, "google_maps_api_key")
    if not api_key:
        return Response(
            content="// Google Maps API key not configured on server.",
            media_type="application/javascript",
        )
    url = f"https://maps.googleapis.com/maps/api/js?key={api_key}&v=weekly"
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url)
        return Response(
            content=resp.content,
            media_type="application/javascript",
            headers={
                "Cache-Control": "public, max-age=3600",
            },
        )
    except Exception as e:
        return Response(
            content=f"// Failed to load Google Maps: {e}",
            media_type="application/javascript",
        )


@router.get("/pins")
async def public_gps_pins(db: AsyncSession = Depends(get_db)):
    """Return all map pins (no auth required)."""
    pins = (await db.execute(select(MapPin).order_by(MapPin.name))).scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "address": p.address,
            "lat": float(p.lat),
            "lng": float(p.lng),
            "color": p.color,
            "permanent": p.permanent or False,
            "note": p.note,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in pins
    ]


@router.get("/pozitii")
async def public_gps_pozitii(db: AsyncSession = Depends(get_db)):
    """Return Traccar vehicle positions (no auth required)."""
    url      = await _get_setting(db, "traccar_url")
    email    = await _get_setting(db, "traccar_email")
    password = await _get_setting(db, "traccar_password")

    if not url or not email or not password:
        return {"vehicles": [], "configured": False}

    if not url.startswith(("http://", "https://")):
        url = "http://" + url
    base = url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10, auth=(email, password)) as client:
            dev_r = await client.get(f"{base}/api/devices")
            pos_r = await client.get(f"{base}/api/positions")
    except Exception as e:
        return {"vehicles": [], "configured": True, "error": str(e)}

    if dev_r.status_code != 200 or pos_r.status_code != 200:
        return {"vehicles": [], "configured": True,
                "error": f"Traccar {dev_r.status_code}/{pos_r.status_code}"}

    devices = {d["id"]: d for d in dev_r.json()}
    vehicles = []
    for pos in pos_r.json():
        dev_id = pos.get("deviceId")
        device = devices.get(dev_id, {})
        vehicles.append({
            "id": dev_id,
            "name": device.get("name", f"Vehicul {dev_id}"),
            "lat": pos.get("latitude"),
            "lng": pos.get("longitude"),
            "speed": round((pos.get("speed") or 0) * 1.852, 1),
            "course": pos.get("course", 0),
            "fixTime": pos.get("fixTime"),
            "status": device.get("status", "unknown"),
        })

    return {"vehicles": vehicles, "configured": True}


@router.get("/comenzi")
async def public_gps_comenzi(db: AsyncSession = Depends(get_db)):
    """Return today's ERP orders with map coordinates (no auth required)."""
    token = await _read_erp_prod_token(db)
    if not token:
        return {"comenzi": [], "total": 0}

    try:
        results = await _fetch_comenzi_erp(token)
    except Exception:
        return {"comenzi": [], "total": 0}

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
            "lat": None, "lng": None,
            "travel_time_min": None, "eta_delivery": None, "eta_return": None,
        })

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


@router.post("/sync")
async def public_gps_sync(db: AsyncSession = Depends(get_db)):
    """Sync ERP orders to map pins (no auth required)."""
    token = await _read_erp_prod_token(db)
    if not token:
        return {"added": 0, "updated": 0, "unchanged": 0, "failed": []}
    try:
        results = await _fetch_comenzi_erp(token)
    except Exception:
        return {"added": 0, "updated": 0, "unchanged": 0, "failed": []}

    livrari = [r for r in results if not _is_ridicare(r.get("shipToAddressText", ""))]
    added = updated = unchanged = 0
    failed: list[str] = []
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
            coords = await geocode_one(address, db, name_hint=name)
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
            else:
                failed.append(name)

    await db.commit()
    return {"added": added, "updated": updated, "unchanged": unchanged, "failed": failed}


@router.post("/maps-js/count")
async def public_gps_maps_js_count(db: AsyncSession = Depends(get_db)):
    """Increment monthly Maps JavaScript API load counter (no auth required)."""
    try:
        now_month = date.today().strftime("%Y-%m")
        month_s = (await db.execute(
            select(Setting).where(Setting.cheie == "google_maps_js_month")
        )).scalar_one_or_none()
        count_s = (await db.execute(
            select(Setting).where(Setting.cheie == "google_maps_js_calls")
        )).scalar_one_or_none()
        stored_month = (month_s.valoare or "") if month_s else ""
        if stored_month != now_month:
            new_count = 1
            if month_s:
                month_s.valoare = now_month
            else:
                db.add(Setting(cheie="google_maps_js_month", valoare=now_month))
        else:
            new_count = (int(count_s.valoare or "0") if count_s else 0) + 1
        if count_s:
            count_s.valoare = str(new_count)
        else:
            db.add(Setting(cheie="google_maps_js_calls", valoare=str(new_count)))
        await db.commit()
        return {"ok": True, "count": new_count}
    except Exception:
        return {"ok": False}

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import date
import httpx
import json

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models import User, Setting, MapPin, Geofence, GeocodeOverride
from app.api.geocoding import geocode_one, travel_time_from_restaurant, save_geocode_override

router = APIRouter(tags=["🗺️ Navigatie"])

# ─── GPS WebSocket clients ────────────────────────────────────────────────────

_gps_ws_clients: set[WebSocket] = set()


async def _broadcast_gps(msg: dict) -> None:
    dead: set[WebSocket] = set()
    for ws in list(_gps_ws_clients):
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            dead.add(ws)
    _gps_ws_clients.difference_update(dead)


@router.websocket("/ws/gps")
async def ws_gps(websocket: WebSocket, token: Optional[str] = Query(None)):
    from app.core.security import decode_token
    if token:
        payload = decode_token(token)
        if not payload:
            await websocket.close(code=4001)
            return
    await websocket.accept()
    _gps_ws_clients.add(websocket)
    try:
        await websocket.send_text(json.dumps({"type": "welcome"}))
        while True:
            await websocket.receive_text()  # keep connection alive
    except WebSocketDisconnect:
        pass
    finally:
        _gps_ws_clients.discard(websocket)


@router.websocket("/ws/gps/public")
async def ws_gps_public(websocket: WebSocket):
    await websocket.accept()
    _gps_ws_clients.add(websocket)
    try:
        await websocket.send_text(json.dumps({"type": "welcome"}))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _gps_ws_clients.discard(websocket)


# ─── Geocoding proxy (Nominatim) ──────────────────────────────────────────────

@router.get("/navigatie/geocode")
async def geocode_address(
    q: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Geocode query: Google Maps (primary, if key set) → Nominatim fallback.
    Returns list of {lat, lon, display_name} for the frontend search box.
    """
    from app.api.geocoding import _read_gmaps_key, google_maps_enabled, _increment_gmaps_counter

    api_key = ""
    if await google_maps_enabled(db):
        api_key = await _read_gmaps_key(db)

    # ── Google Maps Geocoding API ────────────────────────────────────────────
    if api_key:
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params={
                "address": q,
                "key": api_key,
                "region": "ro",
                "language": "ro",
                "components": "country:RO",
            })
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "OK" and data.get("results"):
                await _increment_gmaps_counter(db)
                return [
                    {
                        "lat": str(r["geometry"]["location"]["lat"]),
                        "lon": str(r["geometry"]["location"]["lng"]),
                        "display_name": r.get("formatted_address", ""),
                    }
                    for r in data["results"][:5]
                ]

    # ── Nominatim fallback ───────────────────────────────────────────────────
    url = "https://nominatim.openstreetmap.org/search"
    params = {"format": "json", "q": q, "limit": 5, "countrycodes": "ro"}
    headers = {"User-Agent": "CheltuieliApp/2.1 (internal)"}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params=params, headers=headers)
        resp.raise_for_status()
    return resp.json()


# ─── Map pins CRUD ────────────────────────────────────────────────────────────

@router.get("/navigatie/pins")
async def list_pins(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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


@router.post("/navigatie/pins")
async def create_pin(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Numele este obligatoriu.")

    lat = data.get("lat")
    lng = data.get("lng")
    address_text = (data.get("address") or "").strip() or None

    # If lat/lng not provided, geocode the address
    if lat is None or lng is None:
        if not address_text:
            raise HTTPException(status_code=400, detail="Furnizați lat/lng sau o adresă pentru geocodare.")
        coords = await geocode_one(address_text, db)
        if not coords:
            raise HTTPException(status_code=422, detail=f"Adresa '{address_text}' nu a putut fi geocodată.")
        lat, lng = coords

    permanent = bool(data.get("permanent", True))
    pin = MapPin(
        name=name,
        address=address_text,
        lat=float(lat),
        lng=float(lng),
        color=data.get("color", "blue"),
        permanent=permanent,
    )
    db.add(pin)
    await db.flush()  # get pin.id before geofence insert

    geofence = Geofence(map_pin_id=pin.id, lat=float(lat), lng=float(lng), radius_m=100)
    db.add(geofence)

    await db.commit()
    await db.refresh(pin)
    await _broadcast_gps({"type": "pins_updated"})
    return {
        "id": pin.id,
        "name": pin.name,
        "address": pin.address,
        "lat": float(pin.lat),
        "lng": float(pin.lng),
        "color": pin.color,
        "permanent": pin.permanent or False,
        "created_at": pin.created_at.isoformat() if pin.created_at else None,
    }


@router.patch("/navigatie/pins/{pin_id}")
async def update_pin_address(
    pin_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-geocodează un pin existent cu o adresă corectată."""
    pin = (await db.execute(select(MapPin).where(MapPin.id == pin_id))).scalar_one_or_none()
    if not pin:
        raise HTTPException(status_code=404, detail="Pin negăsit.")

    old_address = pin.address or ""
    address = (data.get("address") or "").strip()
    if not address:
        raise HTTPException(status_code=400, detail="Adresa este obligatorie.")

    coords = await geocode_one(address, db, name_hint=pin.name)
    if not coords:
        raise HTTPException(status_code=422, detail=f"Adresa nu a putut fi geocodată: {address}")

    lat, lng = coords
    pin.address = address
    pin.lat = lat
    pin.lng = lng
    tm = await travel_time_from_restaurant(lat, lng, db)
    if tm is not None:
        pin.travel_time_min = tm

    await db.commit()

    # Save override keyed by original (wrong) address + link to pin_id for display
    if old_address:
        await save_geocode_override(db, old_address, lat, lng, map_pin_id=pin.id)

    await _broadcast_gps({"type": "pins_updated"})
    return {"id": pin.id, "lat": float(pin.lat), "lng": float(pin.lng), "address": pin.address}


@router.delete("/navigatie/pins/{pin_id}")
async def delete_pin(
    pin_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pin = (await db.execute(select(MapPin).where(MapPin.id == pin_id))).scalar_one_or_none()
    if not pin:
        raise HTTPException(status_code=404, detail="Pin negăsit.")
    await db.delete(pin)
    await db.commit()
    await _broadcast_gps({"type": "pins_updated"})
    return {"ok": True}


# ─── Traccar settings ─────────────────────────────────────────────────────────

async def _get_setting(db: AsyncSession, cheie: str) -> str:
    s = (await db.execute(select(Setting).where(Setting.cheie == cheie))).scalar_one_or_none()
    return (s.valoare or "") if s else ""


@router.get("/navigatie/traccar/pozitii")
async def traccar_pozitii(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Proxy Traccar /api/devices + /api/positions → list of vehicles with GPS coords."""
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
            "speed": round((pos.get("speed") or 0) * 1.852, 1),  # knots → km/h
            "course": pos.get("course", 0),
            "fixTime": pos.get("fixTime"),
            "status": device.get("status", "unknown"),
        })

    return {"vehicles": vehicles, "configured": True}


@router.post("/navigatie/maps-js/count")
async def increment_maps_js_counter(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Increment monthly Maps JavaScript API load counter."""
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


@router.get("/navigatie/traccar-token")
async def get_traccar_token(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Authenticate with Traccar and return a session token for iframe auto-login."""
    url      = await _get_setting(db, "traccar_url")
    email    = await _get_setting(db, "traccar_email")
    password = await _get_setting(db, "traccar_password")

    if not url or not email or not password:
        return {"token": None, "url": url or None}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Get user token from Traccar API
            resp = await client.get(
                f"{url.rstrip('/')}/api/session",
                params={"token": ""},
                auth=(email, password),
            )
            if resp.status_code == 401:
                # Try form-based login
                resp2 = await client.post(
                    f"{url.rstrip('/')}/api/session",
                    data={"email": email, "password": password},
                )
                if resp2.status_code != 200:
                    return {"token": None, "url": url}
                user_data = resp2.json()
            else:
                user_data = resp.json()

            token = user_data.get("token")
            return {"token": token, "url": url}
    except Exception:
        return {"token": None, "url": url}


# ─── Geofences ────────────────────────────────────────────────────────────────

@router.get("/navigatie/geofences")
async def list_geofences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (await db.execute(select(Geofence).where(Geofence.active == True))).scalars().all()
    return [
        {
            "id": g.id,
            "map_pin_id": g.map_pin_id,
            "lat": g.lat,
            "lng": g.lng,
            "radius_m": g.radius_m,
        }
        for g in rows
    ]


# ─── Geocode overrides (adrese greșite → corectate) ──────────────────────────

@router.get("/navigatie/geocode-overrides")
async def list_geocode_overrides(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    overrides = (await db.execute(
        select(GeocodeOverride).order_by(GeocodeOverride.updated_at.desc())
    )).scalars().all()

    # Try to find pin name via map_pin_id or coordinate match
    pins = (await db.execute(select(MapPin))).scalars().all()
    pin_by_id = {p.id: p for p in pins}

    def _find_pin(ov):
        if ov.map_pin_id and ov.map_pin_id in pin_by_id:
            return pin_by_id[ov.map_pin_id]
        # fallback: coord match
        for p in pins:
            if abs(float(p.lat) - float(ov.lat)) < 0.00002 and abs(float(p.lng) - float(ov.lng)) < 0.00002:
                return p
        return None

    result = []
    for ov in overrides:
        pin = _find_pin(ov)
        result.append({
            "id": ov.id,
            "name": pin.name if pin else "—",
            "address_erp": ov.address_normalized,
            "address_current": pin.address or "" if pin else "",
            "lat": float(ov.lat),
            "lng": float(ov.lng),
            "corrected": True,
            "override_id": ov.id,
            "updated_at": ov.updated_at.isoformat() if ov.updated_at else None,
        })
    return result


@router.delete("/navigatie/geocode-overrides/{override_id}")
async def delete_geocode_override(
    override_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (await db.execute(select(GeocodeOverride).where(GeocodeOverride.id == override_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Override negăsit.")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.delete("/navigatie/geofences/{geofence_id}")
async def delete_geofence(
    geofence_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    g = (await db.execute(select(Geofence).where(Geofence.id == geofence_id))).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Geofence negăsit.")
    await db.delete(g)
    await db.commit()
    return {"ok": True}

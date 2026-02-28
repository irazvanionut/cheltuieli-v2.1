from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import date
import httpx

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models import User, Setting, MapPin
from app.api.geocoding import geocode_one

router = APIRouter(tags=["🗺️ Navigatie"])


# ─── Geocoding proxy (Nominatim) ──────────────────────────────────────────────

@router.get("/navigatie/geocode")
async def geocode_address(
    q: str,
    current_user: User = Depends(get_current_user),
):
    """Proxy geocoding request to Nominatim (OpenStreetMap)."""
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

    pin = MapPin(
        name=name,
        address=address_text,
        lat=float(lat),
        lng=float(lng),
        color=data.get("color", "blue"),
    )
    db.add(pin)
    await db.commit()
    await db.refresh(pin)
    return {
        "id": pin.id,
        "name": pin.name,
        "address": pin.address,
        "lat": float(pin.lat),
        "lng": float(pin.lng),
        "color": pin.color,
        "created_at": pin.created_at.isoformat() if pin.created_at else None,
    }


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

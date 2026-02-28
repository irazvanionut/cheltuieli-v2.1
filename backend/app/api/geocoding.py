"""Shared geocoding utilities — Google Maps (primary) + Nominatim (fallback)."""

import re
import httpx
from math import radians, sin, cos, sqrt, atan2
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Setting


# ─── Restaurant location & range filter ──────────────────────────────────────

RESTAURANT_LAT = 44.5064935
RESTAURANT_LNG = 26.2184075
MAX_DISTANCE_KM = 20.0


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 6371.0 * 2 * atan2(sqrt(a), sqrt(1 - a))


def _in_range(lat: float, lng: float) -> bool:
    return _haversine_km(RESTAURANT_LAT, RESTAURANT_LNG, lat, lng) <= MAX_DISTANCE_KM


# ─── Address cleaning helpers ─────────────────────────────────────────────────

def clean_address(address: str) -> str:
    return re.sub(r'\s+', ' ', address.replace(';', ',').replace('  ', ' ')).strip()


def _strip_postal(address: str) -> str:
    return re.sub(r'\b\d{6}\b', '', address).strip().strip(',').strip()


_ILFOV_AREAS = [
    "voluntari", "pantelimon", "popesti", "buftea", "otopeni",
    "chitila", "bragadiru", "magurele", "stefanesti", "stefănești",
    "tunari", "balotesti", "snagov", "corbeanca", "afumati", "afumați",
    "clinceni", "cornetu", "dascalu", "dobroesti", "dragomiresti",
    "branesti", "brănești", "cernica", "ciolpani", "gruiu", "micsunesti",
    "periș", "peris", "petresti", "petreșt", "sindrilita", "tanganu",
]


def _nominatim_query(address: str) -> str:
    """Build geocoding query: strip postal code, add Ilfov or Romania context."""
    cleaned = clean_address(_strip_postal(address))
    lower = cleaned.lower()
    # Already contains location context — just add country
    if any(k in lower for k in ["ilfov", "judet", "județ", "bucuresti", "bucharest"]):
        return cleaned + ", Romania"
    # Ilfov-area cities: add "Ilfov, Romania" to disambiguate from same-named cities elsewhere
    for area in _ILFOV_AREAS:
        if area in lower:
            return cleaned + ", Ilfov, Romania"
    # Unknown area — default to Ilfov context (most deliveries are in Ilfov)
    return cleaned + ", Ilfov, Romania"


# ─── Nominatim ────────────────────────────────────────────────────────────────

async def _try_nominatim(q: str) -> tuple[float, float] | None:
    if not q.strip():
        return None
    url = "https://nominatim.openstreetmap.org/search"
    headers = {"User-Agent": "CheltuieliApp/2.1 (internal)"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params={"format": "json", "q": q, "limit": 1}, headers=headers)
            resp.raise_for_status()
            results = resp.json()
        if results:
            return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception:
        pass
    return None


# ─── Google Maps ──────────────────────────────────────────────────────────────

async def geocode_google(address: str, api_key: str) -> tuple[float, float] | None:
    """Call Google Maps Geocoding API."""
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params={
                "address": address,
                "key": api_key,
                "region": "ro",
                "language": "ro",
            })
            resp.raise_for_status()
            data = resp.json()
        if data.get("status") == "OK" and data.get("results"):
            loc = data["results"][0]["geometry"]["location"]
            return float(loc["lat"]), float(loc["lng"])
    except Exception:
        pass
    return None


# ─── Call counter ─────────────────────────────────────────────────────────────

async def _increment_gmaps_counter(db: AsyncSession) -> None:
    try:
        now_month = date.today().strftime("%Y-%m")
        month_s = (await db.execute(
            select(Setting).where(Setting.cheie == "google_maps_geocoding_month")
        )).scalar_one_or_none()
        count_s = (await db.execute(
            select(Setting).where(Setting.cheie == "google_maps_geocoding_calls")
        )).scalar_one_or_none()
        stored_month = (month_s.valoare or "") if month_s else ""
        if stored_month != now_month:
            new_count = 1
            if month_s:
                month_s.valoare = now_month
            else:
                db.add(Setting(cheie="google_maps_geocoding_month", valoare=now_month))
        else:
            new_count = (int(count_s.valoare or "0") if count_s else 0) + 1
        if count_s:
            count_s.valoare = str(new_count)
        else:
            db.add(Setting(cheie="google_maps_geocoding_calls", valoare=str(new_count)))
        await db.commit()
    except Exception:
        pass


async def _read_gmaps_key(db: AsyncSession) -> str:
    s = (await db.execute(
        select(Setting).where(Setting.cheie == "google_maps_api_key")
    )).scalar_one_or_none()
    return (s.valoare or "").strip() if s else ""


async def google_maps_enabled(db: AsyncSession) -> bool:
    """Returns False when the admin has disabled all Google Maps API calls."""
    s = (await db.execute(
        select(Setting).where(Setting.cheie == "google_maps_disabled")
    )).scalar_one_or_none()
    return (s.valoare or "") != "true"


# ─── Combined entry point ─────────────────────────────────────────────────────

async def geocode_one(address: str, db: AsyncSession | None = None) -> tuple[float, float] | None:
    """Geocode address: Google Maps (primary, if key set) → Nominatim fallback.

    All results are filtered to within MAX_DISTANCE_KM of the restaurant.
    Business-name fallback: tries the raw name as a POI/firm search when
    structured address geocoding fails (e.g. 'Remat Green, Stefanesti').
    """
    api_key = ""
    if db is not None:
        if await google_maps_enabled(db):
            api_key = await _read_gmaps_key(db)

    clean   = clean_address(address)
    structured = _nominatim_query(address)  # postal stripped + Ilfov/Romania context

    async def _google_ok(q: str) -> tuple[float, float] | None:
        coords = await geocode_google(q, api_key)
        if coords and _in_range(*coords):
            if db is not None:
                await _increment_gmaps_counter(db)
            return coords
        return None

    async def _nom_ok(q: str) -> tuple[float, float] | None:
        coords = await _try_nominatim(q)
        return coords if (coords and _in_range(*coords)) else None

    # ── 1. Google Maps — address (primary) ───────────────────────────────────
    if api_key:
        # 1a. Cleaned address — Google understands Romanian addresses & businesses
        if coords := await _google_ok(clean):
            return coords
        # 1b. With explicit Ilfov/Romania context
        if clean != structured:
            if coords := await _google_ok(structured):
                return coords

    # ── 2. Nominatim — structured address fallback ───────────────────────────
    if coords := await _nom_ok(structured):
        return coords

    no_num = re.sub(r'\s+\d+[A-Za-z]?\b', '', structured).strip().strip(',').strip()
    if no_num != structured:
        if coords := await _nom_ok(no_num):
            return coords

    postal = re.search(r'\b(\d{6})\b', address)
    if postal:
        if coords := await _nom_ok(postal.group(1) + ", Romania"):
            return coords

    # ── 3. Business / firm name fallback ─────────────────────────────────────
    # When structured address parsing fails, try as a raw business/POI name.
    # E.g. "Remat Green; Stefanesti" → "Remat Green, Stefanesti, Ilfov, Romania"
    # Uses _nominatim_query so "Stefanesti" gets "Ilfov" context (avoids Stefanesti, Arges).
    business_q = _nominatim_query(clean)  # clean already has ';'→',' done
    if api_key and business_q != structured:
        if coords := await _google_ok(business_q):
            return coords

    # Nominatim business search (OSM may have the firm listed)
    if business_q != structured:
        if coords := await _nom_ok(business_q):
            return coords

    return None


# ─── Travel time from restaurant ──────────────────────────────────────────────

_OSRM_URL = "https://router.project-osrm.org"


async def travel_time_from_restaurant(lat: float, lng: float, db: AsyncSession | None = None) -> float | None:
    """Travel time in minutes from restaurant to (lat, lng).

    Uses Google Distance Matrix with real-time traffic if API key configured,
    falls back to OSRM (no traffic) otherwise.
    """
    api_key = ""
    if db is not None:
        api_key = await _read_gmaps_key(db)

    if api_key:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://maps.googleapis.com/maps/api/distancematrix/json",
                    params={
                        "origins": f"{RESTAURANT_LAT},{RESTAURANT_LNG}",
                        "destinations": f"{lat},{lng}",
                        "mode": "driving",
                        "departure_time": "now",
                        "key": api_key,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            element = data["rows"][0]["elements"][0]
            if element["status"] == "OK":
                dur = element.get("duration_in_traffic", element["duration"])
                return dur["value"] / 60.0
        except Exception:
            pass

    # Fallback: OSRM (no traffic)
    try:
        pts = f"{RESTAURANT_LNG},{RESTAURANT_LAT};{lng},{lat}"
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                f"{_OSRM_URL}/table/v1/driving/{pts}",
                params={"sources": "0", "annotations": "duration"},
            )
            if r.status_code == 200:
                row = r.json().get("durations", [[]])[0]
                if len(row) > 1 and row[1] is not None:
                    return row[1] / 60.0
    except Exception:
        pass

    return None

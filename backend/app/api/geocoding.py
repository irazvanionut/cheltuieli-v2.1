"""Shared geocoding utilities — Google Maps (primary) + Nominatim (fallback)."""

import re
import httpx
from math import radians, sin, cos, sqrt, atan2
from datetime import date, datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Setting, GeocodeOverride


# ─── Restaurant location & range filter ──────────────────────────────────────

RESTAURANT_LAT = 44.505798
RESTAURANT_LNG = 26.218803
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
    # Replace ';' with space (not comma) so "centura; 8a" → "centura 8a", not "centura, 8a"
    # A comma makes geocoders treat "centura" as a locality component instead of a street name.
    address = address.replace(';', ' ')
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


# ─── Google Address Validation API ───────────────────────────────────────────

_GOOD_GRANULARITIES = {"SUB_PREMISE", "PREMISE", "PREMISE_PROXIMITY", "BLOCK", "ROUTE"}


async def _validate_address_google(
    address: str, api_key: str, expected_locality: str | None = None
) -> tuple[float, float] | None:
    """Call Google Address Validation API (more authoritative than Geocoding API).

    Returns coords only when validationGranularity is PREMISE/ROUTE level and,
    if expected_locality is given, the locality component is CONFIRMED and matches.
    Prevents cross-locality snapping (e.g. Afumați street returned as Voluntari).
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://addressvalidation.googleapis.com/v1:validateAddress",
                params={"key": api_key},
                json={"address": {"regionCode": "RO", "addressLines": [address]}},
            )
            resp.raise_for_status()
            data = resp.json()

        result = data.get("result", {})
        verdict = result.get("verdict", {})
        granularity = verdict.get("validationGranularity", "OTHER")

        if granularity not in _GOOD_GRANULARITIES:
            return None

        loc = result.get("geocode", {}).get("location", {})
        lat, lng = loc.get("latitude"), loc.get("longitude")
        if lat is None or lng is None:
            return None

        if expected_locality:
            components = result.get("address", {}).get("addressComponents", [])
            confirmed = False
            exp = expected_locality.lower()
            for comp in components:
                ctype = comp.get("componentType", "")
                if ctype in ("locality", "administrative_area_level_3",
                             "sublocality", "sublocality_level_1", "postal_town"):
                    level = comp.get("confirmationLevel", "")
                    name = comp.get("componentName", {}).get("text", "").lower()
                    if level == "CONFIRMED" and (exp in name or name in exp):
                        confirmed = True
                        break
            if not confirmed:
                return None

        return float(lat), float(lng)
    except Exception:
        pass
    return None


# ─── Google Maps ──────────────────────────────────────────────────────────────

def _extract_locality(address: str) -> str | None:
    """Return the Ilfov locality name found in the address, or None."""
    lower = address.lower()
    for area in _ILFOV_AREAS:
        if area in lower:
            return area
    return None


def _google_locality_ok(result: dict, expected: str) -> bool:
    """Return True if the Google result's locality matches expected (case-insensitive substring)."""
    exp = expected.lower()
    for comp in result.get("address_components", []):
        types = comp.get("types", [])
        if any(t in types for t in ("locality", "sublocality", "sublocality_level_1",
                                     "administrative_area_level_3", "postal_town")):
            name = comp.get("long_name", "").lower()
            short = comp.get("short_name", "").lower()
            if exp in name or exp in short or name in exp or short in exp:
                return True
    return False


async def geocode_google(address: str, api_key: str,
                         expected_locality: str | None = None) -> tuple[float, float] | None:
    """Call Google Maps Geocoding API.

    If *expected_locality* is given, the result is rejected when the returned
    address_components don't contain that locality — preventing cross-locality
    snapping (e.g. Aurel Vlaicu in Voluntari instead of Afumati).
    """
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
            result = data["results"][0]
            if expected_locality and not _google_locality_ok(result, expected_locality):
                return None  # wrong locality — let caller fall through to Nominatim
            loc = result["geometry"]["location"]
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
    return (s.valoare or "") != "true" if s else True


# ─── Geocode overrides (persistent manual corrections) ───────────────────────

def _normalize_for_override(address: str) -> str:
    return clean_address(address).lower()


async def _lookup_geocode_override(db: AsyncSession, address: str) -> tuple[float, float] | None:
    key = _normalize_for_override(address)
    row = (await db.execute(
        select(GeocodeOverride).where(GeocodeOverride.address_normalized == key)
    )).scalar_one_or_none()
    if row:
        return float(row.lat), float(row.lng)
    return None


async def save_geocode_override(
    db: AsyncSession,
    original_address: str,
    lat: float,
    lng: float,
    map_pin_id: int | None = None,
) -> None:
    """UPSERT a geocode override so future geocode_one() calls skip external APIs."""
    key = _normalize_for_override(original_address)
    existing = (await db.execute(
        select(GeocodeOverride).where(GeocodeOverride.address_normalized == key)
    )).scalar_one_or_none()
    if existing:
        existing.lat = lat
        existing.lng = lng
        if map_pin_id is not None:
            existing.map_pin_id = map_pin_id
    else:
        db.add(GeocodeOverride(address_normalized=key, lat=lat, lng=lng, map_pin_id=map_pin_id))
    try:
        await db.commit()
    except Exception:
        await db.rollback()


# ─── Combined entry point ─────────────────────────────────────────────────────

async def geocode_one(address: str, db: AsyncSession | None = None, name_hint: str | None = None) -> tuple[float, float] | None:
    """Geocode address: Google Maps (primary, if key set) → Nominatim fallback.

    All results are filtered to within MAX_DISTANCE_KM of the restaurant.
    Business-name fallback: tries the raw name as a POI/firm search when
    structured address geocoding fails (e.g. 'Remat Green, Stefanesti').

    name_hint: optional customer/business name (e.g. ERP customerName_).
      - If address has no locality but name_hint contains one (e.g. "voluntari voluntari"),
        the locality is extracted and injected into the geocoding query.
      - As last fallback, tries "name_hint + address" as a combined business/POI search.
    """
    api_key = ""
    if db is not None:
        if await google_maps_enabled(db):
            api_key = await _read_gmaps_key(db)

    clean      = clean_address(address)

    # ── Override lookup — persistent manual corrections, checked first ────────
    if db is not None:
        if coords := await _lookup_geocode_override(db, clean):
            return coords

    structured = _nominatim_query(address)  # postal stripped + Ilfov/Romania context
    locality   = _extract_locality(clean)   # e.g. "afumati", "voluntari", None

    # If no locality in address, try to extract one from the customer/business name.
    # E.g. customerName_ = "voluntari voluntari" → locality = "voluntari"
    # → augments query: "Str Scolii, 40, voluntari, Ilfov, Romania"
    if not locality and name_hint:
        locality_from_hint = _extract_locality(name_hint)
        if locality_from_hint and locality_from_hint not in clean.lower():
            clean      = f"{clean}, {locality_from_hint}"
            structured = _nominatim_query(clean)
            locality   = locality_from_hint

    async def _google_ok(q: str) -> tuple[float, float] | None:
        coords = await geocode_google(q, api_key, expected_locality=locality)
        if coords and _in_range(*coords):
            if db is not None:
                await _increment_gmaps_counter(db)
            return coords
        return None

    async def _nom_ok(q: str) -> tuple[float, float] | None:
        coords = await _try_nominatim(q)
        return coords if (coords and _in_range(*coords)) else None

    # ── 0. Google Address Validation API — most authoritative ────────────────
    if api_key:
        if coords := await _validate_address_google(structured, api_key, expected_locality=locality):
            if _in_range(*coords):
                if db is not None:
                    await _increment_gmaps_counter(db)
                return coords

    # ── 1. Google Maps — address (primary) ───────────────────────────────────
    if api_key:
        # 1a. Structured query first — explicit locality context ("afumati, Ilfov, Romania")
        if coords := await _google_ok(structured):
            return coords
        # 1b. Cleaned address fallback
        if clean != structured:
            if coords := await _google_ok(clean):
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

    # ── 4. Combined name_hint + address search ────────────────────────────────
    # For cases like "remat green" + "centura; 8a" where neither address nor name
    # contains an explicit locality.  Google knows the business by name.
    if name_hint:
        hint_q = _nominatim_query(f"{name_hint}, {clean_address(address)}")
        if hint_q not in (structured, business_q):
            if api_key:
                if coords := await _google_ok(hint_q):
                    return coords
            if coords := await _nom_ok(hint_q):
                return coords

    return None


# ─── Travel time from restaurant ──────────────────────────────────────────────

_OSRM_URL = "https://router.project-osrm.org"


async def travel_time_from_restaurant(
    lat: float,
    lng: float,
    db: AsyncSession | None = None,
    departure_ts: int | None = None,
) -> float | None:
    """Travel time in minutes from restaurant to (lat, lng).

    departure_ts: Unix timestamp when the car is expected to leave (order_time + prep).
                  Must be in the future; if None or in the past, uses 'now'.
    Uses Google Distance Matrix with traffic if API key configured, falls back to OSRM.
    """
    api_key = ""
    if db is not None:
        api_key = await _read_gmaps_key(db)

    if api_key:
        now_ts = int(datetime.now(timezone.utc).timestamp())
        dept = departure_ts if (departure_ts and departure_ts > now_ts) else "now"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://maps.googleapis.com/maps/api/distancematrix/json",
                    params={
                        "origins": f"{RESTAURANT_LAT},{RESTAURANT_LNG}",
                        "destinations": f"{lat},{lng}",
                        "mode": "driving",
                        "departure_time": dept,
                        "key": api_key,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            element = data["rows"][0]["elements"][0]
            print(f"[TravelTime] Google status={data.get('status')} elem={element.get('status')} dept={dept} has_traffic={'duration_in_traffic' in element} duration={element.get('duration',{}).get('value')} traffic={element.get('duration_in_traffic',{}).get('value')}")
            if element["status"] == "OK":
                dur = element.get("duration_in_traffic", element["duration"])
                return dur["value"] / 60.0
        except Exception as e:
            print(f"[TravelTime] Google error: {e}")

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
                    print(f"[TravelTime] OSRM fallback → {row[1]/60:.1f} min")
                    return row[1] / 60.0
    except Exception as e:
        print(f"[TravelTime] OSRM error: {e}")

    return None

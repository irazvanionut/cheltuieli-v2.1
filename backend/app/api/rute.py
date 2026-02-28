"""Delivery route grouping and optimization — OSRM + Google Directions."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, date
from math import atan2, degrees, cos, sin, radians
import httpx

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User, Setting, MapPin
from app.api.geocoding import RESTAURANT_LAT, RESTAURANT_LNG, geocode_one, google_maps_enabled

router = APIRouter(tags=["🗺️ Rute"])

OSRM_URL = "https://router.project-osrm.org"
BEARING_THRESHOLD = 45.0
TIME_THRESHOLD_SEC = 900  # 15 minutes


# ─── Geometry helpers ─────────────────────────────────────────────────────────

def _bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
    dlng = lng2 - lng1
    x = sin(dlng) * cos(lat2)
    y = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlng)
    return (degrees(atan2(x, y)) + 360) % 360


def _angular_diff(a: float, b: float) -> float:
    diff = abs(a - b) % 360
    return min(diff, 360 - diff)


def _mean_bearing(bearings: list[float]) -> float:
    if not bearings:
        return 0.0
    xs = sum(cos(radians(b)) for b in bearings) / len(bearings)
    ys = sum(sin(radians(b)) for b in bearings) / len(bearings)
    return (degrees(atan2(ys, xs)) + 360) % 360


# ─── Google polyline decoder ──────────────────────────────────────────────────

def _decode_polyline(encoded: str) -> list[list[float]]:
    points, index, lat, lng = [], 0, 0, 0
    while index < len(encoded):
        result, shift = 0, 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        lat += ~(result >> 1) if result & 1 else result >> 1
        result, shift = 0, 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        lng += ~(result >> 1) if result & 1 else result >> 1
        points.append([lat / 1e5, lng / 1e5])
    return points


# ─── Clustering ───────────────────────────────────────────────────────────────

def _cluster_orders(orders: list[dict]) -> list[list[dict]]:
    """Group orders by similar bearing (±45°) AND creation time (±15min)."""
    assigned = [False] * len(orders)
    clusters = []
    for i, pivot in enumerate(orders):
        if assigned[i]:
            continue
        cluster = [pivot]
        assigned[i] = True
        for j, other in enumerate(orders):
            if assigned[j]:
                continue
            bearing_ok = _angular_diff(pivot["bearing"], other["bearing"]) <= BEARING_THRESHOLD
            time_ok = abs((pivot["ts"] - other["ts"]).total_seconds()) <= TIME_THRESHOLD_SEC
            if bearing_ok and time_ok:
                cluster.append(other)
                assigned[j] = True
        clusters.append(cluster)
    return clusters


def _assign_clusters_to_drivers(
    clusters: list[list[dict]],
) -> tuple[list[list[dict]], list[list[dict]]]:
    """Assign clusters (trips) to 2 drivers by bearing proximity."""
    if not clusters:
        return [], []

    clusters = sorted(clusters, key=lambda c: -len(c))

    if len(clusters) == 1:
        # Split single cluster into 2 trips by bearing midpoint
        by_bearing = sorted(clusters[0], key=lambda o: o["bearing"])
        mid = max(1, len(by_bearing) // 2)
        return [[by_bearing[:mid]]], [[by_bearing[mid:]]]

    driver1_trips = [clusters[0]]
    driver2_trips = [clusters[1]]

    for extra in clusters[2:]:
        avg1 = _mean_bearing([o["bearing"] for d in driver1_trips for o in d])
        avg2 = _mean_bearing([o["bearing"] for d in driver2_trips for o in d])
        extra_avg = _mean_bearing([o["bearing"] for o in extra])
        if _angular_diff(extra_avg, avg1) <= _angular_diff(extra_avg, avg2):
            driver1_trips.append(extra)
        else:
            driver2_trips.append(extra)

    return driver1_trips, driver2_trips


# ─── OSRM routing ─────────────────────────────────────────────────────────────

async def _route_osrm(stops: list[dict]) -> dict | None:
    """OSRM Trip API: restaurant → optimal(stops) → restaurant."""
    if not stops:
        return None
    coords = [(RESTAURANT_LNG, RESTAURANT_LAT)] + [(s["lng"], s["lat"]) for s in stops]
    coord_str = ";".join(f"{lng},{lat}" for lng, lat in coords)
    url = f"{OSRM_URL}/trip/v1/driving/{coord_str}"
    params = {"roundtrip": "true", "source": "first",
              "geometries": "geojson", "overview": "full", "steps": "false"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return None

    if data.get("code") != "Ok" or not data.get("trips"):
        return None

    trip = data["trips"][0]
    legs = trip.get("legs", [])
    total_sec = trip["duration"]
    return_sec = legs[-1]["duration"] if legs else 0
    route_sec = total_sec - return_sec

    waypoints = data.get("waypoints", [])
    stop_order = list(range(len(stops)))
    if len(waypoints) > 1:
        try:
            delivery_wps = [(waypoints[i]["waypoint_index"], i - 1) for i in range(1, len(waypoints))]
            delivery_wps.sort(key=lambda x: x[0])
            stop_order = [orig for _, orig in delivery_wps]
        except (KeyError, IndexError):
            pass

    geom_coords = trip["geometry"]["coordinates"]
    geometry = [[lat, lng] for lng, lat in geom_coords]

    return {
        "duration_min": round(route_sec / 60, 1),
        "return_min": round(return_sec / 60, 1),
        "total_min": round(total_sec / 60, 1),
        "geometry": geometry,
        "stop_order": stop_order,
    }


# ─── Google Directions ────────────────────────────────────────────────────────

async def _read_gmaps_key(db: AsyncSession) -> str:
    s = (await db.execute(
        select(Setting).where(Setting.cheie == "google_maps_api_key")
    )).scalar_one_or_none()
    return (s.valoare or "").strip() if s else ""


async def _increment_directions_counter(db: AsyncSession) -> None:
    try:
        now_month = date.today().strftime("%Y-%m")
        month_s = (await db.execute(
            select(Setting).where(Setting.cheie == "google_maps_directions_month")
        )).scalar_one_or_none()
        count_s = (await db.execute(
            select(Setting).where(Setting.cheie == "google_maps_directions_calls")
        )).scalar_one_or_none()
        stored_month = (month_s.valoare or "") if month_s else ""
        if stored_month != now_month:
            new_count = 1
            if month_s:
                month_s.valoare = now_month
            else:
                db.add(Setting(cheie="google_maps_directions_month", valoare=now_month))
        else:
            new_count = (int(count_s.valoare or "0") if count_s else 0) + 1
        if count_s:
            count_s.valoare = str(new_count)
        else:
            db.add(Setting(cheie="google_maps_directions_calls", valoare=str(new_count)))
        await db.commit()
    except Exception:
        pass


async def _route_google(stops: list[dict], api_key: str, db: AsyncSession) -> dict | None:
    if not api_key or not stops:
        return None
    if not await google_maps_enabled(db):
        return None
    origin = f"{RESTAURANT_LAT},{RESTAURANT_LNG}"
    waypoints = "|".join(f"{s['lat']},{s['lng']}" for s in stops)
    params = {
        "origin": origin,
        "destination": origin,
        "waypoints": f"optimize:true|{waypoints}",
        "departure_time": "now",
        "traffic_model": "best_guess",
        "key": api_key,
        "language": "ro",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://maps.googleapis.com/maps/api/directions/json",
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return None

    if data.get("status") != "OK" or not data.get("routes"):
        return None

    route = data["routes"][0]
    legs = route.get("legs", [])
    if not legs:
        return None

    def _leg_dur(leg: dict) -> int:
        return leg.get("duration_in_traffic", leg.get("duration", {})).get("value", 0)

    total_sec = sum(_leg_dur(l) for l in legs)
    return_sec = _leg_dur(legs[-1])
    route_sec = total_sec - return_sec

    encoded = route.get("overview_polyline", {}).get("points", "")
    geometry = _decode_polyline(encoded) if encoded else []
    stop_order = route.get("waypoint_order", list(range(len(stops))))

    await _increment_directions_counter(db)

    return {
        "duration_min": round(route_sec / 60, 1),
        "return_min": round(return_sec / 60, 1),
        "total_min": round(total_sec / 60, 1),
        "geometry": geometry,
        "stop_order": stop_order,
        "available": True,
    }


# ─── Google Maps deep-link ────────────────────────────────────────────────────

def _maps_url(stops: list[dict]) -> str:
    base = f"https://www.google.com/maps/dir/{RESTAURANT_LAT},{RESTAURANT_LNG}"
    for s in stops:
        base += f"/{s['lat']},{s['lng']}"
    base += f"/{RESTAURANT_LAT},{RESTAURANT_LNG}"
    return base


# ─── Trip builder ─────────────────────────────────────────────────────────────

async def _build_trip(group: list[dict], api_key: str, db: AsyncSession,
                      engines: frozenset = frozenset({"osrm", "google"})) -> dict:
    """Route one group of orders as a single trip and return stops + timings."""
    osrm   = await _route_osrm(group)                        if "osrm"    in engines else None
    google = await _route_google(group, api_key, db)         if "google"  in engines else None
    routexl_out: dict = {"available": False}                 # stub — full integration TBD

    stop_order = None
    if osrm and osrm.get("stop_order"):
        stop_order = osrm["stop_order"]
    elif google and google.get("stop_order"):
        stop_order = google["stop_order"]

    if stop_order:
        try:
            ordered = [group[i] for i in stop_order]
        except IndexError:
            ordered = group
    else:
        ordered = group

    stops = [
        {
            "id": o.get("id"),
            "number": o.get("number"),
            "name": o.get("customer_name"),
            "address": o.get("address"),
            "lat": o["lat"],
            "lng": o["lng"],
            "order": i + 1,
            "bearing": round(o["bearing"], 1),
            "status_label": o.get("status_label"),
            "status_color": o.get("status_color"),
        }
        for i, o in enumerate(ordered)
    ]

    osrm_out = {k: v for k, v in osrm.items() if k != "stop_order"} if osrm else None
    google_out = ({k: v for k, v in google.items() if k != "stop_order"}
                  if google else {"available": False})

    return {
        "comenzi": stops,
        "osrm": osrm_out,
        "google": google_out,
        "routexl": routexl_out,
        "maps_url": _maps_url(ordered),
    }


async def _build_driver(sofer_nr: int, trips: list[list[dict]], api_key: str,
                        db: AsyncSession, engines: frozenset = frozenset({"osrm", "google"})) -> dict:
    if not trips:
        return {"sofer": sofer_nr, "curse": []}
    curse = []
    for trip in trips:
        if trip:
            curse.append(await _build_trip(trip, api_key, db, engines))
    return {"sofer": sofer_nr, "curse": curse}


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/comenzi/rute")
async def calculeaza_rute(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Group deliveries into trips (same direction + ≤15min apart), route for 2 drivers.

    Body:
        comenzi: list of {id, number, customer_name, address, created_at, status_label, status_color}
        sofer1_ids: optional list of order IDs → force Driver 1 pool
        sofer2_ids: optional list of order IDs → force Driver 2 pool
    """
    raw = data.get("comenzi", [])
    if not raw:
        raise HTTPException(status_code=400, detail="Nicio comandă trimisă.")

    sofer1_ids: set[str] = set(str(x) for x in data.get("sofer1_ids", []))
    sofer2_ids: set[str] = set(str(x) for x in data.get("sofer2_ids", []))

    # ── Geocode: map pin → Google Maps → Nominatim ─────────────────────────────
    orders: list[dict] = []
    for c in raw:
        lat = c.get("lat")
        lng = c.get("lng")

        if (lat is None or lng is None) and c.get("customer_name"):
            pin = (await db.execute(
                select(MapPin).where(
                    func.lower(MapPin.name) == (c["customer_name"] or "").lower().strip()
                )
            )).scalars().first()
            if pin:
                lat, lng = float(pin.lat), float(pin.lng)

        if (lat is None or lng is None) and c.get("address"):
            coords = await geocode_one(c["address"], db)
            if coords:
                lat, lng = coords

        if lat is None or lng is None:
            continue

        try:
            ts = datetime.fromisoformat((c.get("created_at") or "").replace("Z", "+00:00"))
        except Exception:
            ts = datetime.now()

        orders.append({
            **{k: c.get(k) for k in ("id", "number", "customer_name", "address",
                                      "status_label", "status_color")},
            "lat": float(lat),
            "lng": float(lng),
            "ts": ts,
            "bearing": _bearing(RESTAURANT_LAT, RESTAURANT_LNG, float(lat), float(lng)),
        })

    if not orders:
        raise HTTPException(status_code=422, detail="Nicio comandă nu a putut fi geocodată.")

    # ── Cluster into trips and assign to drivers ────────────────────────────────
    if sofer1_ids and sofer2_ids:
        # User manually assigned orders — re-cluster within each driver's pool
        pool1 = [o for o in orders if str(o["id"]) in sofer1_ids]
        pool2 = [o for o in orders if str(o["id"]) in sofer2_ids]
        # Unassigned orders go to nearest driver by bearing
        for o in orders:
            oid = str(o["id"])
            if oid not in sofer1_ids and oid not in sofer2_ids:
                avg1 = _mean_bearing([x["bearing"] for x in pool1]) if pool1 else 0
                avg2 = _mean_bearing([x["bearing"] for x in pool2]) if pool2 else 180
                if _angular_diff(o["bearing"], avg1) <= _angular_diff(o["bearing"], avg2):
                    pool1.append(o)
                else:
                    pool2.append(o)
        driver1_trips = _cluster_orders(pool1)
        driver2_trips = _cluster_orders(pool2)
    else:
        all_clusters = _cluster_orders(orders)
        driver1_trips, driver2_trips = _assign_clusters_to_drivers(all_clusters)

    api_key = await _read_gmaps_key(db)
    engines = frozenset(data.get("engines", ["osrm", "google"]))

    sofer1 = await _build_driver(1, driver1_trips, api_key, db, engines)
    sofer2 = await _build_driver(2, driver2_trips, api_key, db, engines)

    return {
        "soferi": [sofer1, sofer2],
        "restaurant": {"lat": RESTAURANT_LAT, "lng": RESTAURANT_LNG},
    }

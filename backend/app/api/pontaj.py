"""Pontaj (clock-in/clock-out) — fetches data from legacy API and caches in memory."""

import asyncio
from datetime import datetime, time, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, Depends

from app.core.config import settings, load_legacy_token
from app.core.security import require_admin

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory cache
# ---------------------------------------------------------------------------
pontaj_cache: dict[str, Any] = {
    "last_updated": None,
    "error": None,
    "employees": [],
    "positions": [],
}

_LEGACY_API_BASE = "http://10.170.4.128"
_TIMEOUT = 15.0


# ---------------------------------------------------------------------------
# External API helpers
# ---------------------------------------------------------------------------

def _get_legacy_token() -> str:
    if settings.LEGACY_BEARER_TOKEN:
        return settings.LEGACY_BEARER_TOKEN
    return load_legacy_token()


async def _legacy_post(client: httpx.AsyncClient, port: int, body: dict) -> list:
    """POST to legacy Entity/Get endpoint."""
    url = f"{_LEGACY_API_BASE}:{port}/api/Entity/Get"
    token = _get_legacy_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    resp = await client.post(url, json=body, headers=headers, timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Request bodies (exact format required by legacy API)
# ---------------------------------------------------------------------------

_BODY_CLOCKED_IN = {
    "dataSetName": "ClockedInEmployeeProjection",
    "query": {
        "selectFields": [
            {"name": "_Name"},
            {"name": "_TitleName"},
            {"name": "_RoleName"},
            {"name": "_ClockedInAt"},
            {"name": "_ClockedOutAt"},
            {"name": "_ClockedTime"},
            {"name": "Id"},
            {"name": "PayloadAsJson"},
        ],
        "where": [],
        "orderBy": [],
    },
    "formatOptions": 1,
    "interceptorHideInfoMessages": True,
    "interceptorHideWarningMessages": True,
}

_BODY_EMPLOYEE = {
    "dataSetName": "EmployeeProjection",
    "query": {
        "selectFields": [
            {"name": "Name"},
            {"name": "FirstName"},
            {"name": "MiddleName"},
            {"name": "LastName"},
            {"name": "PhoneNumber"},
            {"name": "UserName_"},
            {"name": "OrganizationalEntity_"},
            {"name": "HireDate"},
            {"name": "EndDate"},
            {"name": "WorkScheduleName"},
            {"name": "Role_"},
            {"name": "Title_"},
            {"name": "LastTimeAccountRecordDate"},
            {"name": "HasPassword"},
            {"name": "HasPin"},
            {"name": "HasCard"},
            {"name": "Id"},
            {"name": "PayloadAsJson"},
        ],
        "where": [],
        "orderBy": [],
    },
    "formatOptions": 1,
}

_BODY_IDENTITY_USER = {
    "dataSetName": "ErpIdentityUser",
    "query": {
        "selectFields": [
            {"name": "Id"},
            {"name": "Name"},
            {"name": "UserName"},
            {"name": "ErpCompositeUserRole"},
            {"name": "PhoneNumber"},
            {"name": "Email"},
        ],
    },
}

_BODY_USER_ROLE = {
    "dataSetName": "ErpCompositeUserRole",
    "query": {
        "selectFields": [],
        "where": [],
        "orderBy": [],
        "pagination": None,
    },
    "formatOptions": 1,
}


# ---------------------------------------------------------------------------
# Fetch & merge logic
# ---------------------------------------------------------------------------

def _extract_results(raw: Any) -> list:
    """Extract results array from legacy API response."""
    if isinstance(raw, dict):
        return raw.get("results") or raw.get("Results") or []
    if isinstance(raw, list):
        return raw
    return []


def _parse_clock_time(raw: str) -> str:
    """Extract HH:MM:SS from various datetime formats."""
    if not raw:
        return ""
    try:
        if "T" in raw:
            return raw.split("T")[1][:8]
        if len(raw) >= 8 and raw[2] == ":" and raw[5] == ":":
            return raw[:8]
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt.strftime("%H:%M:%S")
    except Exception:
        return raw[:8] if len(raw) >= 8 else raw


async def _fetch_pontaj_data() -> dict[str, Any]:
    """Fetch clock-in data from legacy endpoints and merge."""
    async with httpx.AsyncClient() as client:
        # 1) ClockedInEmployeeProjection — who's clocked in right now
        clocked_raw = await _legacy_post(client, 5052, _BODY_CLOCKED_IN)
        clocked_data = _extract_results(clocked_raw)

        # 2) EmployeeProjection — map employee ID → userName_
        emp_raw = await _legacy_post(client, 5052, _BODY_EMPLOYEE)
        emp_data = _extract_results(emp_raw)

        id_to_username: dict[str, str] = {}
        for item in emp_data:
            eid = item.get("id") or item.get("Id") or ""
            username = item.get("userName_") or item.get("UserName_") or ""
            if eid and username:
                id_to_username[eid] = username

        # 3) ErpIdentityUser — map userName → role name
        identity_raw = await _legacy_post(client, 5000, _BODY_IDENTITY_USER)
        identity_data = _extract_results(identity_raw)

        username_to_role: dict[str, str] = {}
        for item in identity_data:
            uname = item.get("userName") or item.get("UserName") or ""
            role = item.get("erpCompositeUserRole") or item.get("ErpCompositeUserRole") or ""
            # Role may be a dict with a name field, or a string
            if isinstance(role, dict):
                role = role.get("name") or role.get("Name") or ""
            if uname and role:
                username_to_role[uname.lower()] = role

        # Build employee list from clocked-in data
        employees = []
        for item in clocked_data:
            name = item.get("_Name") or item.get("_name") or ""
            emp_id = item.get("id") or item.get("Id") or ""
            clocked_in_raw = item.get("_ClockedInAt") or item.get("_clockedInAt") or ""
            clocked_in_at = _parse_clock_time(clocked_in_raw)

            # Get position: ClockedIn fields → EmployeeProjection → ErpIdentityUser
            position = item.get("_RoleName") or item.get("_TitleName") or ""
            if not position and emp_id:
                username = id_to_username.get(emp_id, "")
                if username:
                    position = username_to_role.get(username.lower(), "")

            employees.append({
                "name": name,
                "clocked_in_at": clocked_in_at,
                "position": position,
            })

        employees.sort(key=lambda e: e["clocked_in_at"])

        # 4) ErpCompositeUserRole — all available positions (for filter dropdown)
        role_raw = await _legacy_post(client, 5000, _BODY_USER_ROLE)
        role_data = _extract_results(role_raw)

        all_positions: set[str] = set()
        for item in role_data:
            name = item.get("name") or item.get("Name") or ""
            if name:
                all_positions.add(name)

        # Also add positions from clocked employees (in case they're not in ErpCompositeUserRole)
        for emp in employees:
            if emp["position"]:
                all_positions.add(emp["position"])

        return {
            "employees": employees,
            "positions": sorted(all_positions),
        }


async def refresh_pontaj_cache():
    """Fetch from legacy API and update the in-memory cache."""
    global pontaj_cache
    try:
        result = await _fetch_pontaj_data()
        pontaj_cache = {
            "last_updated": datetime.now().isoformat(),
            "error": None,
            "employees": result["employees"],
            "positions": result["positions"],
        }
        print(f"Pontaj: refreshed — {len(result['employees'])} employees, {len(result['positions'])} positions")
    except Exception as e:
        pontaj_cache["error"] = f"Date intarziate - probleme de conectare la Legacy: {e}"
        pontaj_cache["last_updated"] = datetime.now().isoformat()
        print(f"Pontaj: refresh error — {e}")


# ---------------------------------------------------------------------------
# Background scheduler
# ---------------------------------------------------------------------------

async def pontaj_fetch_loop():
    """Background task: fetch pontaj every 15 min (05-11) or 60 min (11-23)."""
    while True:
        try:
            now = datetime.now()
            hour = now.hour

            if 5 <= hour < 23:
                await refresh_pontaj_cache()

            if 5 <= hour < 11:
                interval = 15 * 60
            elif 11 <= hour < 23:
                interval = 60 * 60
            else:
                target = datetime.combine(now.date(), time(5, 0))
                if now >= target:
                    target += timedelta(days=1)
                interval = (target - now).total_seconds()

            print(f"Pontaj scheduler: next fetch in {interval:.0f}s")
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            print("Pontaj scheduler stopped")
            return
        except Exception as e:
            print(f"Pontaj scheduler error: {e}")
            await asyncio.sleep(60)


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@router.get("/pontaj")
async def get_pontaj():
    """Return cached pontaj data."""
    return pontaj_cache


@router.post("/pontaj/refresh")
async def manual_refresh(admin=Depends(require_admin)):
    """Manual refresh trigger (admin only)."""
    await refresh_pontaj_cache()
    return pontaj_cache

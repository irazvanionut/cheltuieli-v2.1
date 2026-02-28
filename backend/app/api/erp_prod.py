from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional
from datetime import datetime, time, timedelta
import httpx
import asyncio

from app.core.database import get_db, AsyncSessionLocal
from app.core.security import get_current_user, require_admin
from app.models import User, Setting, ErpCustomer
from app.core.log import write_log

router = APIRouter(tags=["🏭 ERP Prod"])

ERP_PROD_URL = "http://10.170.4.101:5020/api/Entity/Get"
ERP_PROD_PAYLOAD = {
    "dataSetName": "CustomerProjectionPlugIn",
    "query": {
        "selectFields": [
            {"name": "Name"},
            {"name": "AddressText"},
            {"name": "PhoneNumber"},
            {"name": "EmailAddress"},
            {"name": "Type"},
            {"name": "Id"},
        ],
        "where": [],
        "orderBy": [],
        "pagination": {"skip": 0, "take": 25000, "useLastRecords": False},
    },
    "formatOptions": 1,
    "endpoint": "/proxy/http://10.170.4.101:5020//api/Entity/Get",
}

_KEY_ALIASES = {
    "erp_id": ["Id", "id"],
    "name":   ["Name", "name"],
    "address":["AddressText", "addressText"],
    "phone":  ["PhoneNumber", "phoneNumber"],
    "email":  ["EmailAddress", "emailAddress"],
    "type":   ["Type", "type"],
}


def _pick(record: dict, aliases: list) -> str:
    for k in aliases:
        if k in record:
            return str(record[k]) if record[k] is not None else ""
    return ""


async def _read_token(db: AsyncSession) -> str:
    result = await db.execute(
        select(Setting).where(Setting.cheie == "erp_prod_bearer_token")
    )
    s = result.scalar_one_or_none()
    return (s.valoare or "") if s else ""


async def _do_sync(db: AsyncSession) -> dict:
    """Fetch all customers from ERP Prod and insert only new ones (by erp_id)."""
    token = await _read_token(db)
    if not token:
        raise ValueError("Bearer token ERP Prod neconfigurat. Setează-l din Settings → Keys.")

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            ERP_PROD_URL,
            json=ERP_PROD_PAYLOAD,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()

    if isinstance(data, list):
        records = data
    else:
        for key in ("results", "result", "data", "items", "rows"):
            if isinstance(data.get(key), list):
                records = data[key]
                break
        else:
            records = []

    added = 0
    for rec in records:
        if not isinstance(rec, dict):
            continue
        erp_id = _pick(rec, _KEY_ALIASES["erp_id"])
        if not erp_id:
            continue

        existing = await db.execute(
            select(ErpCustomer).where(ErpCustomer.erp_id == erp_id)
        )
        if existing.scalar_one_or_none():
            continue

        customer = ErpCustomer(
            erp_id=erp_id,
            name=(_pick(rec, _KEY_ALIASES["name"]) or None),
            address=(_pick(rec, _KEY_ALIASES["address"]) or None),
            phone=(_pick(rec, _KEY_ALIASES["phone"]) or None),
            email=(_pick(rec, _KEY_ALIASES["email"]) or None),
            type=(_pick(rec, _KEY_ALIASES["type"]) or None),
            synced_at=datetime.now(),
        )
        db.add(customer)
        added += 1

    await db.commit()
    return {"added": added, "total_fetched": len(records)}


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/erp-prod/bearer-token")
async def get_erp_prod_bearer_token(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return {"value": await _read_token(db)}


@router.put("/erp-prod/bearer-token")
async def update_erp_prod_bearer_token(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    new_token = (data.get("value") or "").strip()
    result = await db.execute(
        select(Setting).where(Setting.cheie == "erp_prod_bearer_token")
    )
    s = result.scalar_one_or_none()
    if s:
        s.valoare = new_token
    else:
        db.add(Setting(
            cheie="erp_prod_bearer_token",
            valoare=new_token,
            tip="string",
            descriere="Bearer token ERP Prod (clienți)",
        ))
    await db.commit()
    return {"value": new_token}


@router.get("/erp-prod/customers")
async def list_erp_customers(
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=20000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(ErpCustomer)
    if search:
        s = f"%{search.lower()}%"
        q = q.where(
            or_(
                func.lower(ErpCustomer.name).like(s),
                func.lower(ErpCustomer.phone).like(s),
                func.lower(ErpCustomer.email).like(s),
                ErpCustomer.erp_id.like(s),
            )
        )

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()

    q = q.order_by(ErpCustomer.name).offset(skip).limit(limit)
    customers = (await db.execute(q)).scalars().all()

    return {
        "customers": [
            {
                "id": c.id,
                "erp_id": c.erp_id,
                "name": c.name,
                "address": c.address,
                "phone": c.phone,
                "email": c.email,
                "type": c.type,
                "synced_at": c.synced_at.isoformat() if c.synced_at else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in customers
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/erp-prod/customers/sync")
async def sync_erp_customers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    try:
        return await _do_sync(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Eroare ERP Prod ({e.response.status_code}): {e.response.text[:200]}",
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Eroare conectare ERP Prod: {str(e)}")


# ─── Background loop ──────────────────────────────────────────────────────────

async def erp_prod_sync_loop():
    """Background task: sync ERP Prod customers nightly at 03:00."""
    while True:
        try:
            now = datetime.now()
            target = datetime.combine(now.date(), time(3, 0))
            if now >= target:
                target += timedelta(days=1)
            wait_secs = (target - now).total_seconds()
            print(f"ERP Prod sync scheduler: next run at {target} (in {wait_secs:.0f}s)")
            await asyncio.sleep(wait_secs)

            print("ERP Prod sync scheduler: starting nightly sync...")
            async with AsyncSessionLocal() as db:
                result = await _do_sync(db)
            print(
                f"ERP Prod sync scheduler: done — added {result['added']} "
                f"of {result['total_fetched']} fetched"
            )
        except asyncio.CancelledError:
            print("ERP Prod sync scheduler stopped")
            return
        except Exception as e:
            print(f"ERP Prod sync scheduler error: {e}")
            await write_log("ERROR", "erp_prod", "ERP Prod nightly sync error", str(e))
            await asyncio.sleep(3600)

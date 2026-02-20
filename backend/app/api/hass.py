import json
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.models import Setting, HassGroup, HassGroupEntity

router = APIRouter(tags=["hass"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_hass_config() -> tuple[str, str]:
    async with AsyncSessionLocal() as db:
        r1 = await db.execute(select(Setting).where(Setting.cheie == "hass_url"))
        r2 = await db.execute(select(Setting).where(Setting.cheie == "hass_token"))
        url_s = r1.scalar_one_or_none()
        tok_s = r2.scalar_one_or_none()
        url = (url_s.valoare or "").strip() if url_s else ""
        token = (tok_s.valoare or "").strip() if tok_s else ""
    if not url or not token:
        raise HTTPException(
            status_code=400,
            detail="hass_url sau hass_token nu sunt configurate în Setări",
        )
    return url.rstrip("/"), token


def _serialize_group(g: HassGroup) -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "interval_seconds": g.interval_seconds,
        "entities": [
            {
                "id": e.id,
                "entity_id": e.entity_id,
                "friendly_name": e.friendly_name,
                "is_master": e.is_master,
                "sort_order": e.sort_order,
            }
            for e in sorted(g.entities, key=lambda x: (not x.is_master, x.sort_order))
        ],
    }


# ─── HA proxy endpoints ────────────────────────────────────────────────────────

@router.get("/hass/entities")
async def get_ha_entities():
    """Return all HA entities that have a friendly_name."""
    url, token = await _get_hass_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{url}/api/states",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        states = resp.json()

    return [
        {
            "entity_id": s["entity_id"],
            "friendly_name": s.get("attributes", {}).get("friendly_name") or s["entity_id"],
            "state": s["state"],
            "domain": s["entity_id"].split(".")[0],
        }
        for s in states
        if s.get("attributes", {}).get("friendly_name")
    ]


class StatesRequest(BaseModel):
    entity_ids: list[str]


@router.post("/hass/states")
async def get_states_batch(body: StatesRequest):
    """Fetch current states for a list of entity_ids from HA."""
    if not body.entity_ids:
        return {}
    url, token = await _get_hass_config()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{url}/api/states",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        all_states = resp.json()

    wanted = set(body.entity_ids)
    return {
        s["entity_id"]: {
            "state": s["state"],
            "last_updated": s.get("last_updated"),
        }
        for s in all_states
        if s["entity_id"] in wanted
    }


class ServiceCall(BaseModel):
    entity_id: str
    service: str  # "turn_on" | "turn_off"


@router.post("/hass/service")
async def call_service(body: ServiceCall):
    """Proxy a service call (turn_on / turn_off) to HA."""
    url, token = await _get_hass_config()
    domain = body.entity_id.split(".")[0]
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{url}/api/services/{domain}/{body.service}",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"entity_id": body.entity_id},
        )
        resp.raise_for_status()
    return {"ok": True}


# ─── Groups CRUD ───────────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str
    interval_seconds: int = 3


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    interval_seconds: Optional[int] = None


class EntityAdd(BaseModel):
    entity_id: str
    friendly_name: str
    is_master: bool = False


class EntityUpdate(BaseModel):
    is_master: Optional[bool] = None


@router.get("/hass/groups")
async def list_groups():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(HassGroup)
            .options(selectinload(HassGroup.entities))
            .order_by(HassGroup.id)
        )
        groups = result.scalars().all()
    return [_serialize_group(g) for g in groups]


@router.post("/hass/groups", status_code=201)
async def create_group(body: GroupCreate):
    async with AsyncSessionLocal() as db:
        g = HassGroup(name=body.name, interval_seconds=body.interval_seconds)
        db.add(g)
        await db.commit()
        await db.refresh(g)
    return {"id": g.id, "name": g.name, "interval_seconds": g.interval_seconds, "entities": []}


@router.patch("/hass/groups/{group_id}")
async def update_group(group_id: int, body: GroupUpdate):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(HassGroup).where(HassGroup.id == group_id))
        g = result.scalar_one_or_none()
        if not g:
            raise HTTPException(status_code=404, detail="Grup negăsit")
        if body.name is not None:
            g.name = body.name
        if body.interval_seconds is not None:
            g.interval_seconds = body.interval_seconds
        await db.commit()
    return {"ok": True}


@router.delete("/hass/groups/{group_id}")
async def delete_group(group_id: int):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(HassGroup).where(HassGroup.id == group_id))
        g = result.scalar_one_or_none()
        if not g:
            raise HTTPException(status_code=404, detail="Grup negăsit")
        await db.delete(g)
        await db.commit()
    return {"ok": True}


@router.post("/hass/groups/{group_id}/entities", status_code=201)
async def add_entity(group_id: int, body: EntityAdd):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(HassGroup).where(HassGroup.id == group_id))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Grup negăsit")

        if body.is_master:
            existing = await db.execute(
                select(HassGroupEntity)
                .where(HassGroupEntity.group_id == group_id)
                .where(HassGroupEntity.is_master == True)
            )
            for e in existing.scalars().all():
                e.is_master = False

        count_r = await db.execute(
            select(func.count(HassGroupEntity.id)).where(HassGroupEntity.group_id == group_id)
        )
        count = count_r.scalar() or 0

        e = HassGroupEntity(
            group_id=group_id,
            entity_id=body.entity_id,
            friendly_name=body.friendly_name,
            is_master=body.is_master,
            sort_order=count,
        )
        db.add(e)
        await db.commit()
        await db.refresh(e)
    return {
        "id": e.id,
        "entity_id": e.entity_id,
        "friendly_name": e.friendly_name,
        "is_master": e.is_master,
        "sort_order": e.sort_order,
    }


@router.patch("/hass/groups/{group_id}/entities/{entity_id:path}")
async def update_entity(group_id: int, entity_id: str, body: EntityUpdate):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(HassGroupEntity)
            .where(HassGroupEntity.group_id == group_id)
            .where(HassGroupEntity.entity_id == entity_id)
        )
        e = result.scalar_one_or_none()
        if not e:
            raise HTTPException(status_code=404, detail="Entitate negăsită")

        if body.is_master is True:
            existing = await db.execute(
                select(HassGroupEntity)
                .where(HassGroupEntity.group_id == group_id)
                .where(HassGroupEntity.is_master == True)
                .where(HassGroupEntity.entity_id != entity_id)
            )
            for ex in existing.scalars().all():
                ex.is_master = False
            e.is_master = True
        elif body.is_master is False:
            e.is_master = False

        await db.commit()
    return {"ok": True}


@router.delete("/hass/groups/{group_id}/entities/{entity_id:path}")
async def remove_entity(group_id: int, entity_id: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(HassGroupEntity)
            .where(HassGroupEntity.group_id == group_id)
            .where(HassGroupEntity.entity_id == entity_id)
        )
        e = result.scalar_one_or_none()
        if not e:
            raise HTTPException(status_code=404, detail="Entitate negăsită")
        await db.delete(e)
        await db.commit()
    return {"ok": True}

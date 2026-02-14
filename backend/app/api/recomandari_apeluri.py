from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from datetime import date, datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import RecomandariApeluri
from app.schemas.schemas import RecomandariApelResponse

router = APIRouter()


@router.post("/recomandari-apeluri")
async def upsert_recomandari(
    body: dict = Body(...),
    data: str = Query(..., description="Data in format YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
):
    """Receives order insights JSON from external app and upserts into DB."""
    data_date = date.fromisoformat(data.strip())

    conversations = body.get("conversations", [])
    summary = body.get("summary", {})
    total_conversatii = summary.get("total_conversatii", len(conversations))
    top_recomandari = summary.get("top_recomandari", [])
    top_lucruri_bune = summary.get("top_lucruri_bune", [])
    tip_apeluri = summary.get("tip_apeluri", {})

    result = await db.execute(
        select(RecomandariApeluri).where(RecomandariApeluri.data == data_date)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.total_conversatii = total_conversatii
        existing.conversations = conversations
        existing.top_recomandari = top_recomandari
        existing.top_lucruri_bune = top_lucruri_bune
        existing.tip_apeluri = tip_apeluri
        record_id = existing.id
    else:
        record = RecomandariApeluri(
            data=data_date,
            total_conversatii=total_conversatii,
            conversations=conversations,
            top_recomandari=top_recomandari,
            top_lucruri_bune=top_lucruri_bune,
            tip_apeluri=tip_apeluri,
        )
        db.add(record)
        await db.flush()
        record_id = record.id

    return {"status": "ok", "data": str(data_date), "id": record_id}


@router.get("/recomandari-apeluri", response_model=RecomandariApelResponse)
async def get_recomandari(
    data: str = Query(None, description="Data in format YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns recomandari data for a specific date (defaults to today)."""
    data_date = date.fromisoformat(data) if data else date.today()

    result = await db.execute(
        select(RecomandariApeluri).where(RecomandariApeluri.data == data_date)
    )
    record = result.scalar_one_or_none()

    if not record:
        return RecomandariApelResponse(
            id=0,
            data=data_date,
            total_conversatii=0,
            conversations=[],
            top_recomandari=[],
            top_lucruri_bune=[],
            tip_apeluri={},
            created_at=datetime.now(),
        )

    return record


@router.get("/recomandari-apeluri/zile-disponibile")
async def get_zile_disponibile(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns list of dates that have recomandari data."""
    result = await db.execute(
        select(RecomandariApeluri.data)
        .order_by(RecomandariApeluri.data.desc())
    )
    dates = [str(row[0]) for row in result.fetchall()]
    return dates

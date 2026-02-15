from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, case
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
    ai_model: str = Query("Claude", description="AI model used: Claude or Ollama"),
    db: AsyncSession = Depends(get_db),
):
    """Receives order insights JSON from external app and upserts into DB."""
    data_date = date.fromisoformat(data.strip())

    # Validate ai_model
    if ai_model not in ['Claude', 'Ollama']:
        ai_model = 'Claude'

    conversations = body.get("conversations", [])
    summary = body.get("summary", {})
    total_conversatii = summary.get("total_conversatii", len(conversations))
    top_recomandari = summary.get("top_recomandari", [])
    top_lucruri_bune = summary.get("top_lucruri_bune", [])
    tip_apeluri = summary.get("tip_apeluri", {})

    result = await db.execute(
        select(RecomandariApeluri).where(
            RecomandariApeluri.data == data_date,
            RecomandariApeluri.ai_model == ai_model
        )
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
            ai_model=ai_model,
            total_conversatii=total_conversatii,
            conversations=conversations,
            top_recomandari=top_recomandari,
            top_lucruri_bune=top_lucruri_bune,
            tip_apeluri=tip_apeluri,
        )
        db.add(record)
        await db.flush()
        record_id = record.id

    return {"status": "ok", "data": str(data_date), "ai_model": ai_model, "id": record_id}


@router.get("/recomandari-apeluri", response_model=RecomandariApelResponse)
async def get_recomandari(
    data: str = Query(None, description="Data in format YYYY-MM-DD"),
    ai_model: str = Query(None, description="AI model: Claude, Ollama, or None for any"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns recomandari data for a specific date and AI model."""
    data_date = date.fromisoformat(data) if data else date.today()

    # Build query
    query = select(RecomandariApeluri).where(RecomandariApeluri.data == data_date)

    # If ai_model is specified and valid, filter by it
    if ai_model and ai_model in ['Claude', 'Ollama']:
        query = query.where(RecomandariApeluri.ai_model == ai_model)
    else:
        # When "Any" is selected, prefer Claude over Ollama
        # Order by: Claude=1, Ollama=2, others=3
        query = query.order_by(
            case(
                (RecomandariApeluri.ai_model == 'Claude', 1),
                (RecomandariApeluri.ai_model == 'Ollama', 2),
                else_=3
            )
        )

    result = await db.execute(query)
    record = result.scalar_one_or_none()

    if not record:
        return RecomandariApelResponse(
            id=0,
            data=data_date,
            ai_model=ai_model or 'Any',
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
    ai_model: str = Query(None, description="Filter by AI model: Claude or Ollama"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns list of dates that have recomandari data, optionally filtered by AI model."""
    query = select(RecomandariApeluri.data).order_by(RecomandariApeluri.data.desc())

    if ai_model and ai_model in ['Claude', 'Ollama']:
        query = query.where(RecomandariApeluri.ai_model == ai_model)

    result = await db.execute(query)
    # Get unique dates
    dates = sorted(list(set(str(row[0]) for row in result.fetchall())), reverse=True)
    return dates

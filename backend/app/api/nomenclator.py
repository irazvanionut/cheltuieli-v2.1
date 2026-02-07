from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime
from typing import List, Optional

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models import User, Nomenclator, Categorie, Grupa
from app.schemas import (
    AutocompleteResult,
    NomenclatorCreate,
    NomenclatorUpdate,
    NomenclatorResponse
)
from app.services import ai_service

router = APIRouter(tags=["🔍 Autocomplete & Nomenclator"])


@router.get("/autocomplete", response_model=List[AutocompleteResult])
async def autocomplete(
    q: str = Query(..., min_length=1, description="Query de căutare"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Autocomplete inteligent pentru denumiri
    - Folosește pg_trgm pentru fuzzy search
    - Folosește AI embeddings dacă sunt disponibile
    """
    results = await ai_service.autocomplete_ai(q, db, limit)
    return [AutocompleteResult(**r) for r in results]


@router.get("/nomenclator", response_model=List[NomenclatorResponse])
async def list_nomenclator(
    categorie_id: int = Query(None),
    grupa_id: int = Query(None),
    activ: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista nomenclator cu filtre
    """
    query = select(Nomenclator)
    if activ is not None:
        query = query.where(Nomenclator.activ == activ)
    
    if categorie_id:
        query = query.where(Nomenclator.categorie_id == categorie_id)
    if grupa_id:
        query = query.where(Nomenclator.grupa_id == grupa_id)
    
    query = query.order_by(Nomenclator.denumire)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    # Add joined fields
    response = []
    for item in items:
        data = NomenclatorResponse.model_validate(item)
        
        # Get categorie name
        if item.categorie_id:
            cat_result = await db.execute(
                select(Categorie.nume).where(Categorie.id == item.categorie_id)
            )
            data.categorie_nume = cat_result.scalar_one_or_none()
        
        # Get grupa name
        if item.grupa_id:
            grupa_result = await db.execute(
                select(Grupa.nume).where(Grupa.id == item.grupa_id)
            )
            data.grupa_nume = grupa_result.scalar_one_or_none()
        
        response.append(data)
    
    return response


@router.post("/nomenclator", response_model=NomenclatorResponse, status_code=201)
async def create_nomenclator(
    data: NomenclatorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Adaugă item nou în nomenclator
    """
    item = Nomenclator(**data.model_dump())
    
    # Generate embedding if AI is enabled
    try:
        embedding = ai_service.generate_embedding(data.denumire)
        item.embedding = embedding
    except Exception:
        pass  # Continue without embedding
    
    db.add(item)
    await db.commit()
    await db.refresh(item)
    
    response = NomenclatorResponse.model_validate(item)
    
    # Get categorie name
    if item.categorie_id:
        cat_result = await db.execute(
            select(Categorie.nume).where(Categorie.id == item.categorie_id)
        )
        response.categorie_nume = cat_result.scalar_one_or_none()
    
    # Get grupa name
    if item.grupa_id:
        grupa_result = await db.execute(
            select(Grupa.nume).where(Grupa.id == item.grupa_id)
        )
        response.grupa_nume = grupa_result.scalar_one_or_none()
    
    return response


@router.patch("/nomenclator/{item_id}", response_model=NomenclatorResponse)
async def update_nomenclator(
    item_id: int,
    data: NomenclatorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Actualizează item în nomenclator (doar admin)
    """
    result = await db.execute(
        select(Nomenclator).where(Nomenclator.id == item_id)
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item negăsit")
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Regenerate embedding if denumire changed
    if "denumire" in update_data:
        try:
            embedding = ai_service.generate_embedding(update_data["denumire"])
            update_data["embedding"] = embedding
        except Exception:
            pass
    
    for field, value in update_data.items():
        setattr(item, field, value)
    
    await db.commit()
    await db.refresh(item)
    
    response = NomenclatorResponse.model_validate(item)
    
    if item.categorie_id:
        cat_result = await db.execute(
            select(Categorie.nume).where(Categorie.id == item.categorie_id)
        )
        response.categorie_nume = cat_result.scalar_one_or_none()
    
    if item.grupa_id:
        grupa_result = await db.execute(
            select(Grupa.nume).where(Grupa.id == item.grupa_id)
        )
        response.grupa_nume = grupa_result.scalar_one_or_none()
    
    return response


@router.post("/nomenclator/generate-embeddings")
async def generate_embeddings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Generează embeddings AI pentru toate itemele fără embedding
    """
    result = await ai_service.generate_embeddings_for_nomenclator(db)
    return result


@router.post("/nomenclator/update-usage/{item_id}")
async def update_usage(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Actualizează frecvența și ultima utilizare pentru un item
    """
    await db.execute(
        update(Nomenclator)
        .where(Nomenclator.id == item_id)
        .values(
            frecventa_utilizare=Nomenclator.frecventa_utilizare + 1,
            ultima_utilizare=datetime.utcnow()
        )
    )
    await db.commit()
    return {"status": "ok"}

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, text
from datetime import datetime
from typing import List, Optional

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models import User, Nomenclator, Categorie, Grupa, Cheltuiala
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
    # Update AI settings from database before searching
    await ai_service.update_settings(db)
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
    
    query = query.order_by(Nomenclator.categorie_id.asc().nulls_first(), Nomenclator.denumire)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    # Add joined fields
    response = []
    for item in items:
        data = NomenclatorResponse.model_validate(item)
        
        # Get categorie name
        if item.categorie_id is not None:
            cat_result = await db.execute(
                select(Categorie.nume).where(Categorie.id == item.categorie_id)
            )
            data.categorie_nume = cat_result.scalar_one_or_none()
        
        # Get grupa name
        if item.grupa_id is not None:
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
    # Check for duplicates (case-insensitive)
    existing = await db.execute(
        select(Nomenclator).where(
            func.lower(Nomenclator.denumire) == func.lower(data.denumire),
            Nomenclator.activ == True
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Denumirea există deja în nomenclator")
    
    item = Nomenclator(**data.model_dump())

    # Generate embedding automatically
    try:
        await ai_service.update_settings(db)
        embedding = await ai_service.generate_embedding_async(data.denumire)
        if embedding:
            item.embedding = embedding
    except Exception as e:
        print(f"Error generating embedding for {data.denumire}: {e}")

    db.add(item)
    await db.commit()
    await db.refresh(item)
    
    response = NomenclatorResponse.model_validate(item)
    
    # Get categorie name
    if item.categorie_id is not None:
        cat_result = await db.execute(
            select(Categorie.nume).where(Categorie.id == item.categorie_id)
        )
        response.categorie_nume = cat_result.scalar_one_or_none()
    
    # Get grupa name
    if item.grupa_id is not None:
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
            await ai_service.update_settings(db)
            embedding = await ai_service.generate_embedding_async(update_data["denumire"])
            if embedding:
                update_data["embedding"] = embedding
        except Exception as e:
            print(f"Error regenerating embedding: {e}")

    for field, value in update_data.items():
        setattr(item, field, value)
    
    await db.commit()
    await db.refresh(item)
    
    response = NomenclatorResponse.model_validate(item)
    
    if item.categorie_id is not None:
        cat_result = await db.execute(
            select(Categorie.nume).where(Categorie.id == item.categorie_id)
        )
        response.categorie_nume = cat_result.scalar_one_or_none()
    
    if item.grupa_id is not None:
        grupa_result = await db.execute(
            select(Grupa.nume).where(Grupa.id == item.grupa_id)
        )
        response.grupa_nume = grupa_result.scalar_one_or_none()
    
    return response


@router.post("/nomenclator/generate-embeddings")
async def generate_embeddings(
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Generează embeddings AI pentru toate itemele fără embedding.
    Cu force=true regenerează toate, inclusiv cele existente.
    """
    # Update AI settings from database before generating
    await ai_service.update_settings(db)
    result = await ai_service.generate_embeddings_for_nomenclator(db, force=force)
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


@router.post("/nomenclator/asociaza")
async def asociaza_neasociate(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Asociază cheltuielile cu denumire_custom la un nomenclator existent.
    Primeste: { denumire_custom: str, nomenclator_id: int }
    Actualizează cheltuielile: setează nomenclator_id, categorie_id, grupa_id din nomenclator.
    """
    denumire_custom = data.get("denumire_custom", "").strip()
    nomenclator_id = data.get("nomenclator_id")

    if not denumire_custom or not nomenclator_id:
        raise HTTPException(status_code=400, detail="denumire_custom și nomenclator_id sunt obligatorii")

    # Get the nomenclator to get categorie_id and grupa_id
    nom_result = await db.execute(
        select(Nomenclator).where(Nomenclator.id == nomenclator_id)
    )
    nomenclator_item = nom_result.scalar_one_or_none()
    if not nomenclator_item:
        raise HTTPException(status_code=404, detail="Nomenclator negăsit")

    # Update all cheltuieli with this denumire_custom
    result = await db.execute(
        update(Cheltuiala)
        .where(
            Cheltuiala.denumire_custom == denumire_custom,
            Cheltuiala.nomenclator_id == None,
            Cheltuiala.activ == True
        )
        .values(
            nomenclator_id=nomenclator_id,
            categorie_id=nomenclator_item.categorie_id,
            grupa_id=nomenclator_item.grupa_id
        )
    )
    updated_count = result.rowcount
    await db.commit()

    return {"updated": updated_count, "nomenclator_id": nomenclator_id}


@router.get("/nomenclator/neasociate")
async def get_neasociate(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returnează denumirile custom din cheltuieli care nu au nomenclator asociat
    """
    result = await db.execute(
        select(
            Cheltuiala.denumire_custom,
            func.count(Cheltuiala.id).label('count')
        )
        .where(
            Cheltuiala.nomenclator_id == None,
            Cheltuiala.denumire_custom != None,
            Cheltuiala.activ == True
        )
        .group_by(Cheltuiala.denumire_custom)
        .order_by(func.count(Cheltuiala.id).desc())
    )
    rows = result.fetchall()
    return [{"denumire": row.denumire_custom, "count": row.count} for row in rows]

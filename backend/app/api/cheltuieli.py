from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, and_
from datetime import datetime, date
from typing import List, Optional
from decimal import Decimal

from app.core.database import get_db
from app.core.security import get_current_user, require_sef
from app.models import User, Cheltuiala, Exercitiu, Nomenclator, Portofel, Categorie, Grupa
from app.schemas import (
    CheltuialaCreate,
    CheltuialaUpdate,
    CheltuialaResponse
)

router = APIRouter(prefix="/cheltuieli", tags=["💰 Cheltuieli"])


async def get_exercitiu_activ(db: AsyncSession) -> Exercitiu:
    """Get or create active exercitiu"""
    result = await db.execute(
        select(Exercitiu).where(Exercitiu.activ == True).order_by(Exercitiu.data.desc())
    )
    exercitiu = result.scalar_one_or_none()
    
    if not exercitiu:
        # Create new exercitiu for today
        exercitiu = Exercitiu(data=date.today(), activ=True)
        db.add(exercitiu)
        await db.commit()
        await db.refresh(exercitiu)
    
    return exercitiu


async def enrich_cheltuiala(ch: Cheltuiala, db: AsyncSession) -> CheltuialaResponse:
    """Add joined fields to cheltuiala response"""
    data = CheltuialaResponse.model_validate(ch)
    
    # Get denumire from nomenclator or custom
    if ch.nomenclator_id:
        nom_result = await db.execute(
            select(Nomenclator).where(Nomenclator.id == ch.nomenclator_id)
        )
        nom = nom_result.scalar_one_or_none()
        if nom:
            data.denumire = nom.denumire
            if not ch.categorie_id:
                data.categorie_id = nom.categorie_id
            if not ch.grupa_id:
                data.grupa_id = nom.grupa_id
    else:
        data.denumire = ch.denumire_custom
    
    # Get portofel name
    if ch.portofel_id:
        port_result = await db.execute(
            select(Portofel.nume).where(Portofel.id == ch.portofel_id)
        )
        data.portofel_nume = port_result.scalar_one_or_none()
    
    # Get categorie info
    cat_id = data.categorie_id or ch.categorie_id
    if cat_id:
        cat_result = await db.execute(
            select(Categorie).where(Categorie.id == cat_id)
        )
        cat = cat_result.scalar_one_or_none()
        if cat:
            data.categorie_nume = cat.nume
            data.categorie_culoare = cat.culoare
    
    # Get grupa name
    grupa_id = data.grupa_id or ch.grupa_id
    if grupa_id:
        grupa_result = await db.execute(
            select(Grupa.nume).where(Grupa.id == grupa_id)
        )
        data.grupa_nume = grupa_result.scalar_one_or_none()
    
    # Get operator name
    if ch.operator_id:
        op_result = await db.execute(
            select(User.nume_complet).where(User.id == ch.operator_id)
        )
        data.operator_nume = op_result.scalar_one_or_none()
    
    return data


@router.get("", response_model=List[CheltuialaResponse])
async def list_cheltuieli(
    exercitiu_id: Optional[int] = Query(None),
    data_start: Optional[date] = Query(None),
    data_end: Optional[date] = Query(None),
    portofel_id: Optional[int] = Query(None),
    categorie_id: Optional[int] = Query(None),
    verificat: Optional[bool] = Query(None),
    neplatit: Optional[bool] = Query(None),
    activ: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista cheltuieli cu filtre
    Default: cheltuielile din exercițiul activ
    """
    query = select(Cheltuiala).where(Cheltuiala.activ == activ)
    
    if exercitiu_id:
        query = query.where(Cheltuiala.exercitiu_id == exercitiu_id)
    elif not data_start and not data_end:
        # Default to active exercitiu
        exercitiu = await get_exercitiu_activ(db)
        query = query.where(Cheltuiala.exercitiu_id == exercitiu.id)
    
    if data_start or data_end:
        # Filter by date range via exercitiu
        exercitii_query = select(Exercitiu.id)
        if data_start:
            exercitii_query = exercitii_query.where(Exercitiu.data >= data_start)
        if data_end:
            exercitii_query = exercitii_query.where(Exercitiu.data <= data_end)
        
        exercitii_result = await db.execute(exercitii_query)
        exercitii_ids = [e.id for e in exercitii_result.fetchall()]
        query = query.where(Cheltuiala.exercitiu_id.in_(exercitii_ids))
    
    if portofel_id:
        query = query.where(Cheltuiala.portofel_id == portofel_id)
    
    if categorie_id:
        query = query.where(Cheltuiala.categorie_id == categorie_id)
    
    if verificat is not None:
        query = query.where(Cheltuiala.verificat == verificat)
    
    if neplatit is not None:
        query = query.where(Cheltuiala.neplatit == neplatit)
    
    query = query.order_by(Cheltuiala.created_at.desc())
    
    result = await db.execute(query)
    cheltuieli = result.scalars().all()
    
    response = []
    for ch in cheltuieli:
        enriched = await enrich_cheltuiala(ch, db)
        response.append(enriched)
    
    return response


@router.post("", response_model=CheltuialaResponse, status_code=201)
async def create_cheltuiala(
    data: CheltuialaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Adaugă cheltuială nouă
    """
    # Get active exercitiu
    exercitiu = await get_exercitiu_activ(db)
    
    # Validate nomenclator or custom denumire
    if not data.nomenclator_id and not data.denumire_custom:
        raise HTTPException(
            status_code=400,
            detail="Trebuie să specifici nomenclator_id sau denumire_custom"
        )
    
    # If nomenclator_id provided, get categorie/grupa from it
    categorie_id = data.categorie_id
    grupa_id = data.grupa_id
    
    if data.nomenclator_id:
        nom_result = await db.execute(
            select(Nomenclator).where(Nomenclator.id == data.nomenclator_id)
        )
        nom = nom_result.scalar_one_or_none()
        if nom:
            if not categorie_id:
                categorie_id = nom.categorie_id
            if not grupa_id:
                grupa_id = nom.grupa_id
            
            # Update nomenclator usage
            nom.frecventa_utilizare += 1
            nom.ultima_utilizare = datetime.utcnow()
    
    # Create cheltuiala
    cheltuiala = Cheltuiala(
        exercitiu_id=exercitiu.id,
        portofel_id=data.portofel_id,
        nomenclator_id=data.nomenclator_id,
        denumire_custom=data.denumire_custom,
        categorie_id=categorie_id,
        grupa_id=grupa_id,
        suma=data.suma,
        moneda=data.moneda,
        sens=data.sens,
        neplatit=data.neplatit,
        operator_id=current_user.id,
        comentarii=data.comentarii
    )
    
    db.add(cheltuiala)
    await db.commit()
    await db.refresh(cheltuiala)
    
    return await enrich_cheltuiala(cheltuiala, db)


@router.get("/{cheltuiala_id}", response_model=CheltuialaResponse)
async def get_cheltuiala(
    cheltuiala_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obține o cheltuială după ID
    """
    result = await db.execute(
        select(Cheltuiala).where(Cheltuiala.id == cheltuiala_id)
    )
    cheltuiala = result.scalar_one_or_none()
    
    if not cheltuiala:
        raise HTTPException(status_code=404, detail="Cheltuială negăsită")
    
    return await enrich_cheltuiala(cheltuiala, db)


@router.patch("/{cheltuiala_id}", response_model=CheltuialaResponse)
async def update_cheltuiala(
    cheltuiala_id: int,
    data: CheltuialaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Actualizează cheltuială
    """
    result = await db.execute(
        select(Cheltuiala).where(Cheltuiala.id == cheltuiala_id)
    )
    cheltuiala = result.scalar_one_or_none()
    
    if not cheltuiala:
        raise HTTPException(status_code=404, detail="Cheltuială negăsită")
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Handle verificat update
    if "verificat" in update_data and update_data["verificat"]:
        update_data["verificat_de"] = current_user.id
        update_data["verificat_la"] = datetime.utcnow()
    
    for field, value in update_data.items():
        setattr(cheltuiala, field, value)
    
    await db.commit()
    await db.refresh(cheltuiala)
    
    return await enrich_cheltuiala(cheltuiala, db)


@router.delete("/{cheltuiala_id}")
async def delete_cheltuiala(
    cheltuiala_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_sef)
):
    """
    Soft delete cheltuială (doar șef/admin)
    """
    result = await db.execute(
        select(Cheltuiala).where(Cheltuiala.id == cheltuiala_id)
    )
    cheltuiala = result.scalar_one_or_none()
    
    if not cheltuiala:
        raise HTTPException(status_code=404, detail="Cheltuială negăsită")
    
    cheltuiala.activ = False
    await db.commit()
    
    return {"status": "deleted", "id": cheltuiala_id}


@router.post("/{cheltuiala_id}/verifica", response_model=CheltuialaResponse)
async def verifica_cheltuiala(
    cheltuiala_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_sef)
):
    """
    Marchează cheltuiala ca verificată (doar șef)
    """
    result = await db.execute(
        select(Cheltuiala).where(Cheltuiala.id == cheltuiala_id)
    )
    cheltuiala = result.scalar_one_or_none()
    
    if not cheltuiala:
        raise HTTPException(status_code=404, detail="Cheltuială negăsită")
    
    cheltuiala.verificat = True
    cheltuiala.verificat_de = current_user.id
    cheltuiala.verificat_la = datetime.utcnow()
    
    await db.commit()
    await db.refresh(cheltuiala)
    
    return await enrich_cheltuiala(cheltuiala, db)


@router.post("/bulk-verifica")
async def bulk_verifica(
    cheltuieli_ids: List[int],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_sef)
):
    """
    Verifică multiple cheltuieli simultan
    """
    result = await db.execute(
        select(Cheltuiala).where(
            Cheltuiala.id.in_(cheltuieli_ids),
            Cheltuiala.activ == True
        )
    )
    cheltuieli = result.scalars().all()
    
    for ch in cheltuieli:
        ch.verificat = True
        ch.verificat_de = current_user.id
        ch.verificat_la = datetime.utcnow()
    
    await db.commit()
    
    return {"status": "ok", "verified": len(cheltuieli)}

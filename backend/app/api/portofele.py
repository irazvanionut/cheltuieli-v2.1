from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from datetime import date
from typing import List, Optional
from decimal import Decimal

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models import User, Portofel, Transfer, Alimentare, Exercitiu, Cheltuiala
from app.schemas import (
    PortofelCreate,
    PortofelUpdate,
    PortofelResponse,
    PortofelSoldResponse,
    TransferCreate,
    TransferResponse,
    AlimentareCreate,
    AlimentareResponse
)

router = APIRouter(tags=["💼 Portofele & Transferuri"])


# ============================================
# PORTOFELE
# ============================================

@router.get("/portofele", response_model=List[PortofelResponse])
async def list_portofele(
    activ: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista portofele. Fără parametru activ = toate."""
    query = select(Portofel)
    if activ is not None:
        query = query.where(Portofel.activ == activ)
    query = query.order_by(Portofel.ordine)
    result = await db.execute(query)
    return [PortofelResponse.model_validate(p) for p in result.scalars().all()]


@router.get("/portofele/solduri", response_model=List[PortofelSoldResponse])
async def get_solduri_portofele(
    exercitiu_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Solduri portofele
    Default: exercițiul activ
    """
    # Get exercitiu id
    if not exercitiu_id:
        result = await db.execute(
            select(Exercitiu.id).where(Exercitiu.activ == True).order_by(Exercitiu.data.desc())
        )
        row = result.first()
        exercitiu_id = row.id if row else None
    
    # Get portofele with solduri
    result = await db.execute(
        select(Portofel).where(Portofel.activ == True).order_by(Portofel.ordine)
    )
    portofele = result.scalars().all()
    
    response = []
    for p in portofele:
        data = PortofelSoldResponse.model_validate(p)
        
        # Get sold total
        sql = text("SELECT get_sold_portofel(:portofel_id)")
        result = await db.execute(sql, {"portofel_id": p.id})
        data.sold_total = result.scalar() or Decimal("0.00")
        
        # Get sold zi curenta
        if exercitiu_id:
            sql = text("SELECT get_sold_portofel(:portofel_id, :exercitiu_id)")
            result = await db.execute(sql, {"portofel_id": p.id, "exercitiu_id": exercitiu_id})
            data.sold_zi_curenta = result.scalar() or Decimal("0.00")
        
        response.append(data)
    
    return response


@router.post("/portofele", response_model=PortofelResponse, status_code=201)
async def create_portofel(
    data: PortofelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Creează portofel nou (doar admin)"""
    # Check if name exists
    result = await db.execute(
        select(Portofel).where(Portofel.nume == data.nume)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Numele există deja")
    
    portofel = Portofel(**data.model_dump())
    db.add(portofel)
    await db.commit()
    await db.refresh(portofel)
    
    return PortofelResponse.model_validate(portofel)


@router.patch("/portofele/{portofel_id}", response_model=PortofelResponse)
async def update_portofel(
    portofel_id: int,
    data: PortofelUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Actualizează portofel (doar admin)"""
    result = await db.execute(
        select(Portofel).where(Portofel.id == portofel_id)
    )
    portofel = result.scalar_one_or_none()
    
    if not portofel:
        raise HTTPException(status_code=404, detail="Portofel negăsit")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(portofel, field, value)
    
    await db.commit()
    await db.refresh(portofel)
    
    return PortofelResponse.model_validate(portofel)


# ============================================
# ALIMENTARI
# ============================================

@router.get("/alimentari", response_model=List[AlimentareResponse])
async def list_alimentari(
    exercitiu_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista alimentări"""
    query = select(Alimentare)
    
    if exercitiu_id:
        query = query.where(Alimentare.exercitiu_id == exercitiu_id)
    else:
        # Default to active exercitiu
        ex_result = await db.execute(
            select(Exercitiu.id).where(Exercitiu.activ == True).order_by(Exercitiu.data.desc())
        )
        row = ex_result.first()
        if row:
            query = query.where(Alimentare.exercitiu_id == row.id)
    
    query = query.order_by(Alimentare.created_at.desc())
    result = await db.execute(query)
    alimentari = result.scalars().all()
    
    response = []
    for a in alimentari:
        data = AlimentareResponse.model_validate(a)
        
        # Get portofel name
        port_result = await db.execute(
            select(Portofel.nume).where(Portofel.id == a.portofel_id)
        )
        data.portofel_nume = port_result.scalar_one_or_none()
        
        response.append(data)
    
    return response


@router.post("/alimentari", response_model=AlimentareResponse, status_code=201)
async def create_alimentare(
    data: AlimentareCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Alimentează portofel"""
    # Get active exercitiu
    result = await db.execute(
        select(Exercitiu).where(Exercitiu.activ == True).order_by(Exercitiu.data.desc())
    )
    exercitiu = result.scalar_one_or_none()
    
    if not exercitiu:
        # Create new exercitiu
        exercitiu = Exercitiu(data=date.today(), activ=True)
        db.add(exercitiu)
        await db.commit()
        await db.refresh(exercitiu)
    
    alimentare = Alimentare(
        exercitiu_id=exercitiu.id,
        portofel_id=data.portofel_id,
        suma=data.suma,
        moneda=data.moneda,
        operator_id=current_user.id,
        comentarii=data.comentarii
    )
    
    db.add(alimentare)
    await db.commit()
    await db.refresh(alimentare)
    
    response = AlimentareResponse.model_validate(alimentare)
    
    # Get portofel name
    port_result = await db.execute(
        select(Portofel.nume).where(Portofel.id == alimentare.portofel_id)
    )
    response.portofel_nume = port_result.scalar_one_or_none()
    
    return response


# ============================================
# TRANSFERURI
# ============================================

@router.get("/transferuri", response_model=List[TransferResponse])
async def list_transferuri(
    exercitiu_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista transferuri"""
    query = select(Transfer)
    
    if exercitiu_id:
        query = query.where(Transfer.exercitiu_id == exercitiu_id)
    else:
        # Default to active exercitiu
        ex_result = await db.execute(
            select(Exercitiu.id).where(Exercitiu.activ == True).order_by(Exercitiu.data.desc())
        )
        row = ex_result.first()
        if row:
            query = query.where(Transfer.exercitiu_id == row.id)
    
    query = query.order_by(Transfer.created_at.desc())
    result = await db.execute(query)
    transferuri = result.scalars().all()
    
    response = []
    for t in transferuri:
        data = TransferResponse.model_validate(t)
        
        # Get portofel names
        sursa_result = await db.execute(
            select(Portofel.nume).where(Portofel.id == t.portofel_sursa_id)
        )
        data.portofel_sursa_nume = sursa_result.scalar_one_or_none()
        
        dest_result = await db.execute(
            select(Portofel.nume).where(Portofel.id == t.portofel_dest_id)
        )
        data.portofel_dest_nume = dest_result.scalar_one_or_none()
        
        response.append(data)
    
    return response


@router.post("/transferuri", response_model=TransferResponse, status_code=201)
async def create_transfer(
    data: TransferCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Transfer între portofele"""
    if data.portofel_sursa_id == data.portofel_dest_id:
        raise HTTPException(status_code=400, detail="Portofelele trebuie să fie diferite")
    
    # Get active exercitiu
    result = await db.execute(
        select(Exercitiu).where(Exercitiu.activ == True).order_by(Exercitiu.data.desc())
    )
    exercitiu = result.scalar_one_or_none()
    
    if not exercitiu:
        exercitiu = Exercitiu(data=date.today(), activ=True)
        db.add(exercitiu)
        await db.commit()
        await db.refresh(exercitiu)
    
    # Create transfer
    transfer = Transfer(
        exercitiu_id=exercitiu.id,
        portofel_sursa_id=data.portofel_sursa_id,
        portofel_dest_id=data.portofel_dest_id,
        suma=data.suma,
        moneda=data.moneda,
        operator_id=current_user.id,
        comentarii=data.comentarii
    )
    
    db.add(transfer)
    await db.commit()
    await db.refresh(transfer)
    
    response = TransferResponse.model_validate(transfer)
    
    # Get portofel names
    sursa_result = await db.execute(
        select(Portofel.nume).where(Portofel.id == transfer.portofel_sursa_id)
    )
    response.portofel_sursa_nume = sursa_result.scalar_one_or_none()
    
    dest_result = await db.execute(
        select(Portofel.nume).where(Portofel.id == transfer.portofel_dest_id)
    )
    response.portofel_dest_nume = dest_result.scalar_one_or_none()
    
    return response

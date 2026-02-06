from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Optional

from app.core.database import get_db
from app.core.security import get_current_user, require_admin, require_sef
from app.models import User, Setting, Categorie, Grupa
from app.schemas import (
    SettingResponse,
    SettingUpdate,
    CategorieCreate,
    CategorieUpdate,
    CategorieResponse,
    GrupaCreate,
    GrupaUpdate,
    GrupaResponse,
    ChatRequest,
    ChatResponse
)
from app.services import ai_service

router = APIRouter(tags=["⚙️ Setări & AI"])


# ============================================
# SETTINGS
# ============================================

@router.get("/settings", response_model=List[SettingResponse])
async def list_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Lista toate setările (doar admin)"""
    result = await db.execute(select(Setting).order_by(Setting.cheie))
    return [SettingResponse.model_validate(s) for s in result.scalars().all()]


@router.get("/settings/ollama/test")
async def test_ollama_connection(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Testează conexiunea la Ollama"""
    await ai_service.update_settings(db)
    return await ai_service.test_connection()


@router.get("/settings/{cheie}", response_model=SettingResponse)
async def get_setting(
    cheie: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Obține o setare după cheie"""
    result = await db.execute(
        select(Setting).where(Setting.cheie == cheie)
    )
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(status_code=404, detail="Setare negăsită")
    
    return SettingResponse.model_validate(setting)


@router.patch("/settings/{cheie}", response_model=SettingResponse)
async def update_setting(
    cheie: str,
    data: SettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Actualizează o setare (doar admin)"""
    result = await db.execute(
        select(Setting).where(Setting.cheie == cheie)
    )
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(status_code=404, detail="Setare negăsită")
    
    if data.valoare is not None:
        setting.valoare = data.valoare
    
    await db.commit()
    await db.refresh(setting)
    
    # Update AI service if needed
    if cheie.startswith('ollama'):
        await ai_service.update_settings(db)
    
    return SettingResponse.model_validate(setting)


# ============================================
# CATEGORII
# ============================================

@router.get("/categorii", response_model=List[CategorieResponse])
async def list_categorii(
    activ: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista categorii. Fără parametru activ = toate."""
    query = select(Categorie)
    if activ is not None:
        query = query.where(Categorie.activ == activ)
    query = query.order_by(Categorie.ordine)
    result = await db.execute(query)
    return [CategorieResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/categorii", response_model=CategorieResponse, status_code=201)
async def create_categorie(
    data: CategorieCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Creează categorie nouă (doar admin)"""
    result = await db.execute(
        select(Categorie).where(Categorie.nume == data.nume)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Categoria există deja")
    
    categorie = Categorie(**data.model_dump())
    db.add(categorie)
    await db.commit()
    await db.refresh(categorie)
    
    return CategorieResponse.model_validate(categorie)


@router.patch("/categorii/{categorie_id}", response_model=CategorieResponse)
async def update_categorie(
    categorie_id: int,
    data: CategorieUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Actualizează categorie (doar admin)"""
    result = await db.execute(
        select(Categorie).where(Categorie.id == categorie_id)
    )
    categorie = result.scalar_one_or_none()
    
    if not categorie:
        raise HTTPException(status_code=404, detail="Categorie negăsită")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(categorie, field, value)
    
    await db.commit()
    await db.refresh(categorie)
    
    return CategorieResponse.model_validate(categorie)


# ============================================
# GRUPE
# ============================================

@router.get("/grupe", response_model=List[GrupaResponse])
async def list_grupe(
    categorie_id: Optional[int] = Query(None),
    activ: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista grupe. Fără parametru activ = toate."""
    query = select(Grupa)
    if activ is not None:
        query = query.where(Grupa.activ == activ)
    
    if categorie_id:
        query = query.where(Grupa.categorie_id == categorie_id)
    
    query = query.order_by(Grupa.ordine)
    
    result = await db.execute(query)
    grupe = result.scalars().all()
    
    response = []
    for g in grupe:
        data = GrupaResponse.model_validate(g)
        
        if g.categorie_id:
            cat_result = await db.execute(
                select(Categorie.nume).where(Categorie.id == g.categorie_id)
            )
            data.categorie_nume = cat_result.scalar_one_or_none()
        
        response.append(data)
    
    return response


@router.post("/grupe", response_model=GrupaResponse, status_code=201)
async def create_grupa(
    data: GrupaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Creează grupă nouă (doar admin)"""
    grupa = Grupa(**data.model_dump())
    db.add(grupa)
    await db.commit()
    await db.refresh(grupa)
    
    response = GrupaResponse.model_validate(grupa)
    
    if grupa.categorie_id:
        cat_result = await db.execute(
            select(Categorie.nume).where(Categorie.id == grupa.categorie_id)
        )
        response.categorie_nume = cat_result.scalar_one_or_none()
    
    return response


@router.patch("/grupe/{grupa_id}", response_model=GrupaResponse)
async def update_grupa(
    grupa_id: int,
    data: GrupaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Actualizează grupă (doar admin)"""
    result = await db.execute(
        select(Grupa).where(Grupa.id == grupa_id)
    )
    grupa = result.scalar_one_or_none()
    
    if not grupa:
        raise HTTPException(status_code=404, detail="Grupă negăsită")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(grupa, field, value)
    
    await db.commit()
    await db.refresh(grupa)
    
    response = GrupaResponse.model_validate(grupa)
    
    if grupa.categorie_id:
        cat_result = await db.execute(
            select(Categorie.nume).where(Categorie.id == grupa.categorie_id)
        )
        response.categorie_nume = cat_result.scalar_one_or_none()
    
    return response


# ============================================
# CHAT AI (BigBoss)
# ============================================

@router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_sef)
):
    """
    Chat cu AI BigBoss (doar șef/admin)
    Poate întreba despre cheltuieli, solduri, statistici
    """
    # Check if AI chat is enabled
    result = await db.execute(
        select(Setting).where(Setting.cheie == 'ai_chat_enabled')
    )
    setting = result.scalar_one_or_none()
    
    if not setting or setting.valoare != 'true':
        raise HTTPException(status_code=400, detail="Chat AI nu este activat")
    
    await ai_service.update_settings(db)
    response = await ai_service.chat(request.message, db, current_user.id)
    
    return ChatResponse(response=response)

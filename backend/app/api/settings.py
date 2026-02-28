from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Dict, Optional
from pathlib import Path
from datetime import datetime, timezone, timedelta
import httpx

from app.core.database import get_db
from app.core.security import get_current_user, require_admin, require_sef
from app.models import User, Setting, Categorie, Grupa, SysLog

SET_FILE = Path("/opt/cheltuieli-v2.1/.set")
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


@router.get("/settings/monede")
async def get_monede(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get available currencies (any authenticated user)"""
    result = await db.execute(
        select(Setting).where(Setting.cheie == 'monede')
    )
    setting = result.scalar_one_or_none()
    valoare = setting.valoare if setting else 'RON:lei,EUR:€,USD:$'

    monede = []
    for pair in valoare.split(','):
        parts = pair.strip().split(':', 1)
        if len(parts) == 2:
            monede.append({"code": parts[0].strip(), "label": parts[1].strip()})

    return monede


@router.get("/settings/ollama/test")
async def test_ollama_connection(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Testează conexiunea la Ollama"""
    await ai_service.update_settings(db)
    return await ai_service.test_connection()


@router.get("/settings/bearer-token")
async def get_bearer_token(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Citește bearer token: DB (erp_bearer_token) → fallback .set"""
    # 1. Check DB first (primary storage)
    result = await db.execute(select(Setting).where(Setting.cheie == "erp_bearer_token"))
    s = result.scalar_one_or_none()
    if s and s.valoare:
        return {"value": s.valoare}

    # 2. Fallback: read from .set file
    if SET_FILE.exists():
        try:
            for line in SET_FILE.read_text().strip().splitlines():
                if line.strip().startswith("bearer"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        return {"value": parts[1].strip()}
        except Exception:
            pass
    return {"value": ""}


@router.put("/settings/bearer-token")
async def update_bearer_token(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Actualizează bearer token în DB (și încearcă și .set dacă e writable)"""
    new_token = (data.get("value") or "").strip()

    # 1. Save to DB (always works)
    result = await db.execute(select(Setting).where(Setting.cheie == "erp_bearer_token"))
    s = result.scalar_one_or_none()
    if s:
        s.valoare = new_token
    else:
        db.add(Setting(cheie="erp_bearer_token", valoare=new_token, tip="string",
                       descriere="Bearer token ERP (pontaj + furnizori)"))
    await db.flush()

    # 2. Also try to update .set file (best-effort, may be read-only in Docker)
    try:
        lines = []
        if SET_FILE.exists():
            lines = SET_FILE.read_text().splitlines()
        found = False
        new_lines = []
        for line in lines:
            if line.strip().startswith("bearer"):
                new_lines.append(f"bearer = {new_token}")
                found = True
            else:
                new_lines.append(line)
        if not found:
            new_lines.append(f"bearer = {new_token}")
        SET_FILE.write_text("\n".join(new_lines) + "\n")
    except (OSError, PermissionError):
        pass  # File is read-only in Docker — DB is the source of truth

    return {"value": new_token}


@router.post("/settings/serpapi/reset-counters")
async def reset_serpapi_counters(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Resetează contoarele de apeluri SerpAPI (ambele chei)."""
    from datetime import date
    current_month = date.today().strftime("%Y-%m")
    for cheie, valoare in [("serpapi_calls_1", "0"), ("serpapi_calls_2", "0"), ("serpapi_calls_month", current_month)]:
        result = await db.execute(select(Setting).where(Setting.cheie == cheie))
        s = result.scalar_one_or_none()
        if s:
            s.valoare = valoare
        else:
            db.add(Setting(cheie=cheie, valoare=valoare, tip="string"))
    await db.commit()
    return {"ok": True, "month": current_month}


@router.put("/settings/{cheie}", response_model=SettingResponse)
async def upsert_setting(
    cheie: str,
    data: SettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Creează sau actualizează o setare (upsert, doar admin)"""
    result = await db.execute(
        select(Setting).where(Setting.cheie == cheie)
    )
    setting = result.scalar_one_or_none()
    if setting:
        if data.valoare is not None:
            setting.valoare = data.valoare
    else:
        setting = Setting(cheie=cheie, valoare=data.valoare or "", tip="string")
        db.add(setting)
    await db.commit()
    await db.refresh(setting)
    return SettingResponse.model_validate(setting)


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
    """Actualizează sau creează o setare (upsert, doar admin)"""
    result = await db.execute(
        select(Setting).where(Setting.cheie == cheie)
    )
    setting = result.scalar_one_or_none()

    if not setting:
        setting = Setting(cheie=cheie, valoare=data.valoare or "", tip="string")
        db.add(setting)
    elif data.valoare is not None:
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
# FURNIZORI (ERP)
# ============================================

ERP_URL = "http://10.170.4.101:5000/api/Entity/Get"
ERP_BODY = {
    "dataSetName": "BusinessPartnerVendorProjection",
    "query": {
        "selectFields": [
            {"name": "Name"}, {"name": "BusinessPartnerType_"}, {"name": "VatCode"},
            {"name": "TaxCode"}, {"name": "TaxNumbers"}, {"name": "PhoneNumber"},
            {"name": "EmailAddress"}, {"name": "AddressText"}, {"name": "RoleNames"},
            {"name": "ContactPersons"}, {"name": "CreatedAt_"}, {"name": "Id"},
        ],
        "where": [],
        "orderBy": [],
    },
    "formatOptions": 1,
    "endpoint": "/proxy/http://10.170.4.101:5000//api/Entity/Get",
}


async def _read_bearer_db(db: AsyncSession) -> str:
    """Citește bearer token pontaj: DB (erp_bearer_token) → fallback .set"""
    result = await db.execute(select(Setting).where(Setting.cheie == "erp_bearer_token"))
    s = result.scalar_one_or_none()
    if s and s.valoare:
        return s.valoare
    if SET_FILE.exists():
        try:
            for line in SET_FILE.read_text().strip().splitlines():
                if line.strip().startswith("bearer"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        return parts[1].strip()
        except Exception:
            pass
    return ""


async def _read_erp_prod_token(db: AsyncSession) -> str:
    """Citește bearer token ERP Prod (10.170.4.101) din DB."""
    result = await db.execute(select(Setting).where(Setting.cheie == "erp_prod_bearer_token"))
    s = result.scalar_one_or_none()
    return (s.valoare or "") if s else ""


@router.get("/furnizori")
async def get_furnizori(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Preia lista furnizori din ERP Prod (10.170.4.101) folosind erp_prod_bearer_token"""
    token = await _read_erp_prod_token(db)
    if not token:
        raise HTTPException(status_code=400, detail="Bearer token ERP Prod neconfigurat. Setează-l din Settings → Keys → Bearer Token — ERP Prod.")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                ERP_URL,
                json=ERP_BODY,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Eroare ERP ({e.response.status_code}): {e.response.text[:200]}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Eroare conectare ERP: {str(e)}")

    # Response is wrapped: {"resultsCount": N, "results": [...]}
    if isinstance(data, list):
        vendors = data
    else:
        vendors = data.get("results", data.get("result", data.get("data", [])))

    # Cache vendor names for autocomplete search
    import json
    names = [v.get("name", "") for v in vendors if v.get("name")]
    cache_result = await db.execute(select(Setting).where(Setting.cheie == 'furnizori_cache'))
    cache_setting = cache_result.scalar_one_or_none()
    if cache_setting:
        cache_setting.valoare = json.dumps(names)
    else:
        db.add(Setting(cheie='furnizori_cache', valoare=json.dumps(names), tip='string'))
    await db.commit()

    return {"vendors": vendors, "count": len(vendors)}


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


# ============================================
# SYS LOG
# ============================================

@router.get("/settings/log")
async def get_sys_log(
    sursa: Optional[str] = Query(None),
    nivel: Optional[str] = Query(None),
    limit: int = Query(200, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Returnează intrările din sys_log (doar admin)."""
    q = select(SysLog).order_by(SysLog.ts.desc()).limit(limit)
    if sursa:
        q = q.where(SysLog.sursa == sursa)
    if nivel:
        q = q.where(SysLog.nivel == nivel)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": r.id,
            "ts": r.ts.isoformat() if r.ts else None,
            "nivel": r.nivel,
            "sursa": r.sursa,
            "mesaj": r.mesaj,
            "detalii": r.detalii,
        }
        for r in rows
    ]


@router.delete("/settings/log")
async def delete_old_sys_log(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Șterge înregistrările mai vechi de 30 de zile."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    result = await db.execute(
        delete(SysLog).where(SysLog.ts < cutoff)
    )
    await db.commit()
    return {"deleted": result.rowcount}

    return ChatResponse(response=response)

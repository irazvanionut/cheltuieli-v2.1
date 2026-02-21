from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import httpx

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User, Setting
from app.models.models import (
    AgendaFurnizor, AgendaContact, AgendaContactCamp,
    AgendaInteractiune, AgendaTodo, Cheltuiala, Nomenclator
)
from app.schemas.schemas import (
    AgendaFurnizorCreate, AgendaFurnizorUpdate,
    AgendaContactCreate, AgendaContactUpdate, AgendaContactCreateStandalone,
    AgendaContactCampCreate, AgendaContactCampUpdate,
    AgendaInteractiuneCreate,
    AgendaTodoCreate, AgendaTodoUpdate,
    AgendaImportErpRequest,
)

router = APIRouter(tags=["📒 Agenda Furnizori"])

SET_FILE = Path("/opt/cheltuieli-v2.1/.set")
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
        "where": [], "orderBy": [],
    },
    "formatOptions": 1,
    "endpoint": "/proxy/http://10.170.4.101:5000//api/Entity/Get",
}


def _read_bearer() -> str:
    if not SET_FILE.exists():
        return ""
    for line in SET_FILE.read_text().strip().splitlines():
        if line.strip().startswith("bearer"):
            parts = line.split("=", 1)
            if len(parts) == 2:
                return parts[1].strip()
    return ""


def _vendor_field(vendor: dict, *keys: str) -> str:
    """Get vendor field, trying multiple key casings."""
    for k in keys:
        v = vendor.get(k) or vendor.get(k.lower()) or vendor.get(k[0].upper() + k[1:])
        if v:
            return str(v).strip()
    return ""


async def _upsert_setting(db: AsyncSession, cheie: str, valoare: str):
    result = await db.execute(select(Setting).where(Setting.cheie == cheie))
    s = result.scalar_one_or_none()
    if s:
        s.valoare = valoare
    else:
        db.add(Setting(cheie=cheie, valoare=valoare, tip='string'))


# ============================================
# HELPERS
# ============================================

def _serialize_contact(c: AgendaContact) -> dict:
    return {
        "id": c.id,
        "furnizor_id": c.furnizor_id,
        "nume": c.nume,
        "rol": c.rol,
        "primar": c.primar,
        "erp_contact": c.erp_contact,
        "activ": c.activ,
        "campuri": [
            {"id": camp.id, "contact_id": camp.contact_id, "tip": camp.tip,
             "valoare": camp.valoare, "ordine": camp.ordine}
            for camp in sorted(c.campuri, key=lambda x: x.ordine)
        ],
        "created_at": c.created_at,
    }


async def _furnizor_list_item(f: AgendaFurnizor) -> dict:
    contact_primar_nume = None
    contact_primar_valoare = None
    for c in f.contacte:
        if c.activ and c.primar:
            contact_primar_nume = c.nume
            for camp in sorted(c.campuri, key=lambda x: x.ordine):
                contact_primar_valoare = camp.valoare
                break
            break
    if contact_primar_nume is None:
        for c in f.contacte:
            if c.activ:
                contact_primar_nume = c.nume
                for camp in sorted(c.campuri, key=lambda x: x.ordine):
                    contact_primar_valoare = camp.valoare
                    break
                break

    ultima = None
    if f.interactiuni:
        ultima = max(i.created_at for i in f.interactiuni)

    todos_open = sum(1 for t in f.todos if not t.rezolvat)

    return {
        "id": f.id,
        "erp_name": f.erp_name,
        "nume": f.nume,
        "categorie": f.categorie,
        "zile_livrare": f.zile_livrare,
        "frecventa_comanda": f.frecventa_comanda,
        "discount_procent": f.discount_procent,
        "termen_plata_zile": f.termen_plata_zile,
        "suma_minima_comanda": f.suma_minima_comanda,
        "rating_intern": f.rating_intern,
        "note_generale": f.note_generale,
        "atentie": f.atentie or False,
        "activ": f.activ,
        "contact_primar_nume": contact_primar_nume,
        "contact_primar_valoare": contact_primar_valoare,
        "ultima_interactiune": ultima,
        "todos_deschise": todos_open,
        "created_at": f.created_at,
    }


def _load_options():
    return [
        selectinload(AgendaFurnizor.contacte).selectinload(AgendaContact.campuri),
        selectinload(AgendaFurnizor.interactiuni),
        selectinload(AgendaFurnizor.todos),
    ]


# ============================================
# SYNC ERP
# ============================================

@router.post("/agenda/sync-erp")
async def sync_erp(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sincronizează furnizorii din ERP în agenda.
    Folosește cache-ul intern (max 30 min) ca să nu lovească ERP la fiecare request.
    Idempotent — safe să rulezi de mai multe ori.
    """
    now = datetime.now(timezone.utc)
    vendors = None

    # 1. Try full cache (< 30 min)
    cache_result = await db.execute(select(Setting).where(Setting.cheie == 'agenda_erp_cache'))
    cache_setting = cache_result.scalar_one_or_none()
    cache_at_result = await db.execute(select(Setting).where(Setting.cheie == 'agenda_erp_cache_at'))
    cache_at_setting = cache_at_result.scalar_one_or_none()

    if cache_setting and cache_setting.valoare and cache_at_setting and cache_at_setting.valoare:
        try:
            cache_at = datetime.fromisoformat(cache_at_setting.valoare)
            if cache_at.tzinfo is None:
                cache_at = cache_at.replace(tzinfo=timezone.utc)
            if now - cache_at < timedelta(minutes=30):
                vendors = json.loads(cache_setting.valoare)
        except Exception:
            pass

    # 2. Fetch from ERP if cache stale
    if vendors is None:
        token = _read_bearer()
        if token:
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.post(
                        ERP_URL, json=ERP_BODY,
                        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    vendors = data.get("results", data.get("result", data.get("data", []))) if isinstance(data, dict) else data

                await _upsert_setting(db, 'agenda_erp_cache', json.dumps(vendors))
                await _upsert_setting(db, 'agenda_erp_cache_at', now.isoformat())
            except Exception:
                vendors = None

        # Fallback: name-only cache
        if vendors is None:
            names_result = await db.execute(select(Setting).where(Setting.cheie == 'furnizori_cache'))
            names_setting = names_result.scalar_one_or_none()
            if names_setting and names_setting.valoare:
                try:
                    names = json.loads(names_setting.valoare)
                    vendors = [{"name": n} for n in names if n]
                except Exception:
                    vendors = []
            else:
                vendors = []

    # 3. Sync vendors → agenda_furnizori + contacte ERP
    created_furnizori = 0
    created_contacts = 0

    for vendor in vendors:
        name = _vendor_field(vendor, "name", "Name")
        if not name:
            continue

        # Find or create furnizor
        result = await db.execute(select(AgendaFurnizor).where(AgendaFurnizor.erp_name == name))
        f = result.scalar_one_or_none()
        if not f:
            f = AgendaFurnizor(erp_name=name, nume=name)
            db.add(f)
            await db.flush()
            created_furnizori += 1

        # Check for phone/email
        phone = _vendor_field(vendor, "phoneNumber", "PhoneNumber")
        email = _vendor_field(vendor, "emailAddress", "EmailAddress")
        contact_persons_raw = _vendor_field(vendor, "contactPersons", "ContactPersons")

        if not phone and not email:
            continue

        # Skip if ERP contact already exists
        erp_check = await db.execute(
            select(AgendaContact).where(
                and_(AgendaContact.furnizor_id == f.id, AgendaContact.erp_contact == True)
            )
        )
        if erp_check.scalar_one_or_none():
            continue

        # Determine contact name
        contact_name = name  # default: company name
        if contact_persons_raw:
            # contactPersons could be comma-separated names
            first = contact_persons_raw.split(",")[0].strip()
            if first:
                contact_name = first

        # Check if any contacts exist (for primar flag)
        any_contact = await db.execute(
            select(AgendaContact).where(
                and_(AgendaContact.furnizor_id == f.id, AgendaContact.activ == True)
            )
        )
        has_any = any_contact.scalar_one_or_none() is not None

        c = AgendaContact(
            furnizor_id=f.id,
            nume=contact_name,
            rol="ERP",
            primar=not has_any,
            erp_contact=True,
            activ=True,
        )
        db.add(c)
        await db.flush()

        ordine = 0
        if phone:
            db.add(AgendaContactCamp(contact_id=c.id, tip="Mobil", valoare=phone, ordine=ordine))
            ordine += 1
        if email:
            db.add(AgendaContactCamp(contact_id=c.id, tip="Email", valoare=email, ordine=ordine))

        created_contacts += 1

    await db.flush()
    return {"created_furnizori": created_furnizori, "created_contacts": created_contacts}


# ============================================
# FURNIZORI
# ============================================

@router.get("/agenda/furnizori")
async def list_furnizori(
    search: Optional[str] = Query(None),
    categorie: Optional[str] = Query(None),
    activ: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(AgendaFurnizor).where(AgendaFurnizor.activ == activ)
    if search:
        # Match furnizor name OR any contact name OR any contact field value (phone/email)
        contact_ids_with_match = (
            select(AgendaContactCamp.contact_id)
            .where(AgendaContactCamp.valoare.ilike(f"%{search}%"))
        )
        furnizor_ids_via_contact = (
            select(AgendaContact.furnizor_id)
            .where(
                and_(
                    AgendaContact.activ == True,
                    or_(
                        AgendaContact.nume.ilike(f"%{search}%"),
                        AgendaContact.id.in_(contact_ids_with_match),
                    )
                )
            )
        )
        stmt = stmt.where(
            or_(
                AgendaFurnizor.nume.ilike(f"%{search}%"),
                AgendaFurnizor.id.in_(furnizor_ids_via_contact),
            )
        )
    if categorie:
        stmt = stmt.where(AgendaFurnizor.categorie == categorie)
    stmt = stmt.order_by(AgendaFurnizor.nume).options(*_load_options())

    result = await db.execute(stmt)
    furnizori = result.scalars().all()
    return [await _furnizor_list_item(f) for f in furnizori]


@router.post("/agenda/furnizori")
async def create_furnizor(
    body: AgendaFurnizorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    f = AgendaFurnizor(**body.model_dump())
    db.add(f)
    await db.flush()
    await db.refresh(f)
    return {"id": f.id, "nume": f.nume, "activ": f.activ, "created_at": f.created_at}


@router.get("/agenda/furnizori/{furnizor_id}")
async def get_furnizor(
    furnizor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(AgendaFurnizor)
        .where(AgendaFurnizor.id == furnizor_id)
        .options(
            selectinload(AgendaFurnizor.contacte).selectinload(AgendaContact.campuri),
            selectinload(AgendaFurnizor.todos),
        )
    )
    result = await db.execute(stmt)
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Furnizor negăsit")

    todos_open = sum(1 for t in f.todos if not t.rezolvat)
    contacte_data = [_serialize_contact(c) for c in f.contacte if c.activ]

    return {
        "id": f.id,
        "erp_name": f.erp_name,
        "nume": f.nume,
        "categorie": f.categorie,
        "zile_livrare": f.zile_livrare,
        "frecventa_comanda": f.frecventa_comanda,
        "discount_procent": f.discount_procent,
        "termen_plata_zile": f.termen_plata_zile,
        "suma_minima_comanda": f.suma_minima_comanda,
        "rating_intern": f.rating_intern,
        "note_generale": f.note_generale,
        "atentie": f.atentie or False,
        "activ": f.activ,
        "contacte": contacte_data,
        "todos_deschise": todos_open,
        "created_at": f.created_at,
        "updated_at": f.updated_at,
    }


@router.patch("/agenda/furnizori/{furnizor_id}")
async def update_furnizor(
    furnizor_id: int,
    body: AgendaFurnizorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaFurnizor).where(AgendaFurnizor.id == furnizor_id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Furnizor negăsit")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(f, key, value)
    await db.flush()
    return {"id": f.id, "ok": True}


@router.delete("/agenda/furnizori/{furnizor_id}")
async def delete_furnizor(
    furnizor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaFurnizor).where(AgendaFurnizor.id == furnizor_id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Furnizor negăsit")
    f.activ = False
    await db.flush()
    return {"ok": True}


# ============================================
# CATEGORII (configurabile, stocate în settings)
# ============================================

DEFAULT_CATEGORII = [
    'Alimente & Ingrediente', 'Băuturi', 'Produse curățenie',
    'Ambalaje & Consumabile', 'Servicii', 'Echipamente & Dotări', 'Altele',
]


@router.get("/agenda/categorii")
async def get_categorii(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Setting).where(Setting.cheie == 'agenda_categorii'))
    s = result.scalar_one_or_none()
    if s and s.valoare:
        try:
            return json.loads(s.valoare)
        except Exception:
            pass
    return DEFAULT_CATEGORII


@router.put("/agenda/categorii")
async def update_categorii(
    categorii: list,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.rol not in ('admin', 'sef'):
        raise HTTPException(status_code=403, detail="Acces interzis")
    await _upsert_setting(db, 'agenda_categorii', json.dumps(categorii))
    await db.flush()
    return {"ok": True, "categorii": categorii}


# ============================================
# CONTACTE STANDALONE (creare fără furnizor obligatoriu)
# ============================================

@router.post("/agenda/contacte")
async def create_contact_standalone(
    body: AgendaContactCreateStandalone,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Creează un contact, opțional legat de un furnizor existent sau nou."""
    furnizor_id = body.furnizor_id

    # Create new furnizor if requested
    if not furnizor_id and body.furnizor_nou:
        f = AgendaFurnizor(erp_name=None, nume=body.furnizor_nou.strip())
        db.add(f)
        await db.flush()
        furnizor_id = f.id

    c = AgendaContact(
        furnizor_id=furnizor_id,
        nume=body.nume,
        rol=body.rol,
        primar=body.primar,
        activ=body.activ,
        erp_contact=False,
    )
    db.add(c)
    await db.flush()

    for i, camp_data in enumerate(body.campuri):
        db.add(AgendaContactCamp(
            contact_id=c.id,
            tip=camp_data.tip,
            valoare=camp_data.valoare,
            ordine=camp_data.ordine if camp_data.ordine else i,
        ))

    await db.flush()

    furnizor_nume = None
    if furnizor_id:
        fres = await db.execute(select(AgendaFurnizor).where(AgendaFurnizor.id == furnizor_id))
        fobj = fres.scalar_one_or_none()
        furnizor_nume = fobj.nume if fobj else None

    return {
        "id": c.id,
        "furnizor_id": c.furnizor_id,
        "furnizor_nume": furnizor_nume,
        "nume": c.nume,
        "rol": c.rol,
        "primar": c.primar,
        "erp_contact": c.erp_contact,
        "activ": c.activ,
        "campuri": [],
        "created_at": c.created_at,
    }


# ============================================
# CONTACTE GLOBAL (pentru view-ul Contacte)
# ============================================

@router.get("/agenda/contacte")
async def list_contacte_global(
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toate contactele active (inclusiv cele fără furnizor), cu search."""
    stmt = (
        select(AgendaContact)
        .outerjoin(AgendaFurnizor, AgendaContact.furnizor_id == AgendaFurnizor.id)
        .where(
            and_(
                AgendaContact.activ == True,
                or_(AgendaFurnizor.activ == True, AgendaContact.furnizor_id.is_(None)),
            )
        )
        .options(
            selectinload(AgendaContact.campuri),
            selectinload(AgendaContact.furnizor),
        )
        .order_by(AgendaContact.nume)
    )

    if search:
        # Search by contact name OR by camp value (phone/email)
        stmt = stmt.where(
            or_(
                AgendaContact.nume.ilike(f"%{search}%"),
                AgendaContact.id.in_(
                    select(AgendaContactCamp.contact_id)
                    .where(AgendaContactCamp.valoare.ilike(f"%{search}%"))
                )
            )
        )

    result = await db.execute(stmt)
    contacte = result.scalars().all()

    return [
        {
            "id": c.id,
            "furnizor_id": c.furnizor_id,
            "furnizor_nume": c.furnizor.nume if c.furnizor else None,
            "furnizor_categorie": c.furnizor.categorie if c.furnizor else None,
            "nume": c.nume,
            "rol": c.rol,
            "primar": c.primar,
            "erp_contact": c.erp_contact,
            "campuri": [
                {"id": camp.id, "contact_id": camp.contact_id,
                 "tip": camp.tip, "valoare": camp.valoare, "ordine": camp.ordine}
                for camp in sorted(c.campuri, key=lambda x: x.ordine)
            ],
            "created_at": c.created_at,
        }
        for c in contacte
    ]


# ============================================
# CHELTUIELI per furnizor
# ============================================

@router.get("/agenda/furnizori/{furnizor_id}/cheltuieli")
async def get_furnizor_cheltuieli(
    furnizor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaFurnizor).where(AgendaFurnizor.id == furnizor_id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Furnizor negăsit")

    search_name = f.erp_name or f.nume
    stmt = (
        select(Cheltuiala)
        .where(and_(
            Cheltuiala.activ == True,
            Cheltuiala.denumire_custom.ilike(f"%{search_name}%"),
        ))
        .order_by(Cheltuiala.created_at.desc())
        .limit(50)
    )
    cheltuieli_result = await db.execute(stmt)
    cheltuieli = list(cheltuieli_result.scalars().all())

    nom_stmt = select(Nomenclator).where(Nomenclator.denumire.ilike(f"%{search_name}%"))
    nom_result = await db.execute(nom_stmt)
    nom_ids = [n.id for n in nom_result.scalars().all()]

    if nom_ids:
        stmt2 = (
            select(Cheltuiala)
            .where(and_(Cheltuiala.activ == True, Cheltuiala.nomenclator_id.in_(nom_ids)))
            .order_by(Cheltuiala.created_at.desc())
            .limit(50)
        )
        seen_ids = {c.id for c in cheltuieli}
        for c in (await db.execute(stmt2)).scalars().all():
            if c.id not in seen_ids:
                cheltuieli.append(c)

    cheltuieli = sorted(cheltuieli, key=lambda c: c.created_at, reverse=True)[:50]
    total = sum(float(c.suma) for c in cheltuieli if c.moneda == 'RON')

    return {
        "total_ron": round(total, 2),
        "count": len(cheltuieli),
        "items": [
            {
                "id": c.id,
                "suma": float(c.suma),
                "moneda": c.moneda,
                "sens": c.sens,
                "denumire_custom": c.denumire_custom,
                "nomenclator_id": c.nomenclator_id,
                "neplatit": c.neplatit,
                "created_at": c.created_at,
            }
            for c in cheltuieli
        ]
    }


# ============================================
# INTERACȚIUNI
# ============================================

@router.get("/agenda/furnizori/{furnizor_id}/interactiuni")
async def list_interactiuni(
    furnizor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(AgendaInteractiune)
        .where(AgendaInteractiune.furnizor_id == furnizor_id)
        .options(selectinload(AgendaInteractiune.user), selectinload(AgendaInteractiune.contact))
        .order_by(AgendaInteractiune.created_at.desc())
    )
    result = await db.execute(stmt)
    items = result.scalars().all()
    return [
        {
            "id": i.id,
            "furnizor_id": i.furnizor_id,
            "contact_id": i.contact_id,
            "nota": i.nota,
            "user_id": i.user_id,
            "user_nume": i.user.nume_complet if i.user else None,
            "contact_nume": i.contact.nume if i.contact else None,
            "created_at": i.created_at,
        }
        for i in items
    ]


@router.post("/agenda/furnizori/{furnizor_id}/interactiuni")
async def create_interactiune(
    furnizor_id: int,
    body: AgendaInteractiuneCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaFurnizor).where(AgendaFurnizor.id == furnizor_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Furnizor negăsit")
    i = AgendaInteractiune(
        furnizor_id=furnizor_id,
        contact_id=body.contact_id,
        nota=body.nota,
        user_id=current_user.id,
    )
    db.add(i)
    await db.flush()
    await db.refresh(i)
    return {
        "id": i.id,
        "furnizor_id": i.furnizor_id,
        "contact_id": i.contact_id,
        "nota": i.nota,
        "user_id": i.user_id,
        "user_nume": current_user.nume_complet,
        "contact_nume": None,
        "created_at": i.created_at,
    }


@router.delete("/agenda/interactiuni/{interactiune_id}")
async def delete_interactiune(
    interactiune_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaInteractiune).where(AgendaInteractiune.id == interactiune_id))
    i = result.scalar_one_or_none()
    if not i:
        raise HTTPException(status_code=404, detail="Interacțiune negăsită")
    await db.delete(i)
    await db.flush()
    return {"ok": True}


# ============================================
# CONTACTE per furnizor
# ============================================

@router.get("/agenda/furnizori/{furnizor_id}/contacte")
async def list_contacte_furnizor(
    furnizor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(AgendaContact)
        .where(AgendaContact.furnizor_id == furnizor_id)
        .options(selectinload(AgendaContact.campuri))
        .order_by(AgendaContact.primar.desc(), AgendaContact.id)
    )
    result = await db.execute(stmt)
    return [_serialize_contact(c) for c in result.scalars().all()]


@router.post("/agenda/furnizori/{furnizor_id}/contacte")
async def create_contact(
    furnizor_id: int,
    body: AgendaContactCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaFurnizor).where(AgendaFurnizor.id == furnizor_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Furnizor negăsit")

    c = AgendaContact(
        furnizor_id=furnizor_id,
        nume=body.nume,
        rol=body.rol,
        primar=body.primar,
        activ=body.activ,
        erp_contact=False,
    )
    db.add(c)
    await db.flush()

    campuri = []
    for i, camp_data in enumerate(body.campuri):
        camp = AgendaContactCamp(
            contact_id=c.id,
            tip=camp_data.tip,
            valoare=camp_data.valoare,
            ordine=camp_data.ordine if camp_data.ordine else i,
        )
        db.add(camp)
        campuri.append(camp)

    await db.flush()
    return _serialize_contact(c)


@router.patch("/agenda/contacte/{contact_id}")
async def update_contact(
    contact_id: int,
    body: AgendaContactUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaContact).where(AgendaContact.id == contact_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Contact negăsit")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(c, key, value)
    await db.flush()
    return {"id": c.id, "ok": True}


@router.delete("/agenda/contacte/{contact_id}")
async def delete_contact(
    contact_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaContact).where(AgendaContact.id == contact_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Contact negăsit")
    c.activ = False
    await db.flush()
    return {"ok": True}


# ============================================
# CÂMPURI
# ============================================

@router.post("/agenda/contacte/{contact_id}/campuri")
async def create_camp(
    contact_id: int,
    body: AgendaContactCampCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaContact).where(AgendaContact.id == contact_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Contact negăsit")
    camp = AgendaContactCamp(contact_id=contact_id, **body.model_dump())
    db.add(camp)
    await db.flush()
    await db.refresh(camp)
    return {"id": camp.id, "contact_id": camp.contact_id, "tip": camp.tip,
            "valoare": camp.valoare, "ordine": camp.ordine}


@router.patch("/agenda/campuri/{camp_id}")
async def update_camp(
    camp_id: int,
    body: AgendaContactCampUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaContactCamp).where(AgendaContactCamp.id == camp_id))
    camp = result.scalar_one_or_none()
    if not camp:
        raise HTTPException(status_code=404, detail="Câmp negăsit")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(camp, key, value)
    await db.flush()
    return {"id": camp.id, "ok": True}


@router.delete("/agenda/campuri/{camp_id}")
async def delete_camp(
    camp_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaContactCamp).where(AgendaContactCamp.id == camp_id))
    camp = result.scalar_one_or_none()
    if not camp:
        raise HTTPException(status_code=404, detail="Câmp negăsit")
    await db.delete(camp)
    await db.flush()
    return {"ok": True}


# ============================================
# TODOS
# ============================================

@router.get("/agenda/todos")
async def list_todos(
    furnizor_id: Optional[int] = Query(None),
    rezolvat: Optional[bool] = Query(None),
    tip: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(AgendaTodo).options(selectinload(AgendaTodo.furnizor))
    if furnizor_id is not None:
        stmt = stmt.where(AgendaTodo.furnizor_id == furnizor_id)
    if rezolvat is not None:
        stmt = stmt.where(AgendaTodo.rezolvat == rezolvat)
    if tip:
        stmt = stmt.where(AgendaTodo.tip == tip)
    stmt = stmt.order_by(AgendaTodo.prioritate, AgendaTodo.created_at.desc())
    result = await db.execute(stmt)

    return [
        {
            "id": t.id,
            "furnizor_id": t.furnizor_id,
            "furnizor_nume": t.furnizor.nume if t.furnizor else None,
            "titlu": t.titlu,
            "cantitate": t.cantitate,
            "tip": t.tip,
            "prioritate": t.prioritate,
            "rezolvat": t.rezolvat,
            "data_scadenta": t.data_scadenta,
            "user_id": t.user_id,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }
        for t in result.scalars().all()
    ]


@router.post("/agenda/todos")
async def create_todo(
    body: AgendaTodoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaFurnizor).where(AgendaFurnizor.id == body.furnizor_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Furnizor negăsit")
    t = AgendaTodo(**body.model_dump(), user_id=current_user.id)
    db.add(t)
    await db.flush()
    await db.refresh(t)
    return {
        "id": t.id, "furnizor_id": t.furnizor_id, "furnizor_nume": None,
        "titlu": t.titlu, "cantitate": t.cantitate, "tip": t.tip,
        "prioritate": t.prioritate, "rezolvat": t.rezolvat,
        "data_scadenta": t.data_scadenta, "user_id": t.user_id,
        "created_at": t.created_at, "updated_at": t.updated_at,
    }


@router.patch("/agenda/todos/{todo_id}")
async def update_todo(
    todo_id: int,
    body: AgendaTodoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaTodo).where(AgendaTodo.id == todo_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Todo negăsit")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(t, key, value)
    await db.flush()
    return {"id": t.id, "ok": True}


@router.delete("/agenda/todos/{todo_id}")
async def delete_todo(
    todo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(AgendaTodo).where(AgendaTodo.id == todo_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Todo negăsit")
    await db.delete(t)
    await db.flush()
    return {"ok": True}

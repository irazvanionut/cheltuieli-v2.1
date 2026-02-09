from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, func, or_, case
from datetime import datetime, date, timedelta
from typing import List, Optional
from decimal import Decimal
from collections import defaultdict

from app.core.database import get_db
from app.core.security import get_current_user, require_sef
from app.models import (
    User, Exercitiu, Cheltuiala, Portofel, Categorie, Grupa, 
    Nomenclator, Alimentare, Transfer
)
from app.schemas import (
    ExercitiumCreate,
    ExercitiumClose,
    ExercitiumResponse,
    RaportZilnic,
    RaportCategorie,
    RaportGrupa,
    RaportCategorieItem,
    RaportPortofel
)

router = APIRouter(tags=["📅 Exerciții & Rapoarte"])


# ============================================
# EXERCITII
# ============================================

@router.get("/exercitii", response_model=List[ExercitiumResponse])
async def list_exercitii(
    limit: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista exerciții (ultimele N zile)"""
    result = await db.execute(
        select(Exercitiu)
        .order_by(Exercitiu.data.desc())
        .limit(limit)
    )
    return [ExercitiumResponse.model_validate(e) for e in result.scalars().all()]


@router.get("/exercitii/curent", response_model=ExercitiumResponse)
async def get_exercitiu_curent(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține exercițiul activ curent. Auto-închide dacă e din ziua precedentă și e trecut de 07:00."""
    result = await db.execute(
        select(Exercitiu)
        .where(Exercitiu.activ == True)
        .order_by(Exercitiu.data.desc())
    )
    exercitiu = result.scalar_one_or_none()

    now = datetime.now()
    today = date.today()

    # Auto-close stale exercitiu: if it's past 07:00 and the exercitiu is from a previous day
    if exercitiu and exercitiu.data < today and now.hour >= 7:
        exercitiu.activ = False
        exercitiu.ora_inchidere = now
        exercitiu.observatii = ((exercitiu.observatii or '') + ' [Închis automat 07:00]').strip()
        await db.flush()
        exercitiu = None  # will create new one below

    if not exercitiu:
        # Check if today's exercitiu already exists (closed earlier)
        existing = await db.execute(
            select(Exercitiu).where(Exercitiu.data == today)
        )
        exercitiu = existing.scalar_one_or_none()
        if exercitiu:
            # Reactivate today's exercitiu
            exercitiu.activ = True
        else:
            # Create new exercitiu for today
            exercitiu = Exercitiu(data=today, activ=True)
            db.add(exercitiu)
        await db.commit()
        await db.refresh(exercitiu)

    return ExercitiumResponse.model_validate(exercitiu)


@router.post("/exercitii", response_model=ExercitiumResponse, status_code=201)
async def create_exercitiu(
    data: ExercitiumCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_sef)
):
    """Deschide exercițiu nou manual (doar șef)"""
    data_ex = data.data or date.today()
    
    # Check if exists
    result = await db.execute(
        select(Exercitiu).where(Exercitiu.data == data_ex)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(status_code=400, detail="Exercițiul pentru această dată există deja")
    
    # Close any open exercitii
    await db.execute(
        text("UPDATE exercitii SET activ = false WHERE activ = true")
    )
    
    exercitiu = Exercitiu(
        data=data_ex,
        activ=True,
        observatii=data.observatii
    )
    db.add(exercitiu)
    await db.commit()
    await db.refresh(exercitiu)
    
    return ExercitiumResponse.model_validate(exercitiu)


@router.post("/exercitii/inchide", response_model=ExercitiumResponse)
async def inchide_exercitiu(
    data: ExercitiumClose,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_sef)
):
    """Închide exercițiul activ (doar șef)"""
    result = await db.execute(
        select(Exercitiu)
        .where(Exercitiu.activ == True)
        .order_by(Exercitiu.data.desc())
    )
    exercitiu = result.scalar_one_or_none()
    
    if not exercitiu:
        raise HTTPException(status_code=404, detail="Nu există exercițiu activ")
    
    exercitiu.activ = False
    exercitiu.ora_inchidere = datetime.utcnow()
    exercitiu.inchis_de = current_user.id
    if data.observatii:
        exercitiu.observatii = data.observatii
    
    await db.commit()
    await db.refresh(exercitiu)
    
    return ExercitiumResponse.model_validate(exercitiu)


@router.get("/exercitii/{exercitiu_id}", response_model=ExercitiumResponse)
async def get_exercitiu(
    exercitiu_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obține un exercițiu după ID"""
    result = await db.execute(
        select(Exercitiu).where(Exercitiu.id == exercitiu_id)
    )
    exercitiu = result.scalar_one_or_none()
    
    if not exercitiu:
        raise HTTPException(status_code=404, detail="Exercițiu negăsit")
    
    return ExercitiumResponse.model_validate(exercitiu)


# ============================================
# RAPOARTE
# ============================================

@router.get("/rapoarte/zilnic", response_model=RaportZilnic)
async def get_raport_zilnic(
    exercitiu_id: Optional[int] = Query(None),
    data_raport: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Raport zilnic grupat pe Categorie → Grupă → Denumire
    Default: exercițiul activ
    """
    # Get exercitiu
    if exercitiu_id:
        result = await db.execute(
            select(Exercitiu).where(Exercitiu.id == exercitiu_id)
        )
    elif data_raport:
        result = await db.execute(
            select(Exercitiu).where(Exercitiu.data == data_raport)
        )
    else:
        result = await db.execute(
            select(Exercitiu)
            .where(Exercitiu.activ == True)
            .order_by(Exercitiu.data.desc())
        )
    
    exercitiu = result.scalar_one_or_none()
    
    if not exercitiu:
        # Return empty report
        return RaportZilnic(
            exercitiu_id=0,
            data=date.today(),
            activ=False,
            categorii=[],
            portofele=[],
            total_cheltuieli={},
            total_neplatit={},
            total_sold={}
        )
    
    # Get all categorii
    cat_result = await db.execute(
        select(Categorie)
        .where(Categorie.activ == True)
        .order_by(Categorie.ordine)
    )
    categorii = cat_result.scalars().all()
    
    # Get cheltuieli for this exercitiu
    ch_result = await db.execute(
        select(Cheltuiala)
        .where(
            Cheltuiala.exercitiu_id == exercitiu.id,
            Cheltuiala.activ == True,
            Cheltuiala.sens == 'Cheltuiala'
        )
        .order_by(Cheltuiala.created_at.desc())
    )
    cheltuieli = ch_result.scalars().all()
    
    # Helper to add to a per-currency dict
    def add_to_dict(d: dict, moneda: str, val: Decimal):
        d[moneda] = d.get(moneda, Decimal("0")) + val

    def merge_dicts(a: dict, b: dict) -> dict:
        result = dict(a)
        for k, v in b.items():
            result[k] = result.get(k, Decimal("0")) + v
        return result

    # Build categorii report
    categorii_report = []
    total_cheltuieli: dict[str, Decimal] = {}
    total_neplatit: dict[str, Decimal] = {}
    matched_ch_ids = set()

    for cat in categorii:
        # Get grupe for this categorie
        grupe_result = await db.execute(
            select(Grupa)
            .where(Grupa.categorie_id == cat.id, Grupa.activ == True)
            .order_by(Grupa.ordine)
        )
        grupe = grupe_result.scalars().all()

        # Filter cheltuieli for this categorie
        cat_cheltuieli = []
        for ch in cheltuieli:
            ch_cat_id = ch.categorie_id
            if not ch_cat_id and ch.nomenclator_id:
                nom_result = await db.execute(
                    select(Nomenclator.categorie_id).where(Nomenclator.id == ch.nomenclator_id)
                )
                ch_cat_id = nom_result.scalar_one_or_none()

            if ch_cat_id == cat.id:
                cat_cheltuieli.append(ch)
                matched_ch_ids.add(ch.id)

        if not cat_cheltuieli and not grupe:
            continue

        # Build grupe report
        grupe_report = []
        cat_total_platit: dict[str, Decimal] = {}
        cat_total_neplatit: dict[str, Decimal] = {}

        ch_by_grupa = defaultdict(list)
        for ch in cat_cheltuieli:
            ch_grupa_id = ch.grupa_id
            if not ch_grupa_id and ch.nomenclator_id:
                nom_result = await db.execute(
                    select(Nomenclator.grupa_id).where(Nomenclator.id == ch.nomenclator_id)
                )
                ch_grupa_id = nom_result.scalar_one_or_none()
            ch_by_grupa[ch_grupa_id].append(ch)

        for grupa in grupe:
            grupa_cheltuieli = ch_by_grupa.get(grupa.id, [])
            if not grupa_cheltuieli:
                continue

            items = []
            grupa_total: dict[str, Decimal] = {}

            for ch in grupa_cheltuieli:
                if ch.nomenclator_id:
                    nom_result = await db.execute(
                        select(Nomenclator.denumire).where(Nomenclator.id == ch.nomenclator_id)
                    )
                    denumire = nom_result.scalar_one_or_none() or "N/A"
                else:
                    denumire = ch.denumire_custom or "N/A"

                m = ch.moneda or 'RON'
                items.append(RaportCategorieItem(
                    denumire=denumire,
                    suma=ch.suma,
                    moneda=m,
                    neplatit=ch.neplatit,
                    verificat=ch.verificat,
                    cheltuiala_id=ch.id
                ))

                if ch.neplatit:
                    add_to_dict(cat_total_neplatit, m, ch.suma)
                else:
                    add_to_dict(cat_total_platit, m, ch.suma)
                    add_to_dict(grupa_total, m, ch.suma)

            grupe_report.append(RaportGrupa(
                grupa_id=grupa.id,
                grupa_nume=grupa.nume,
                items=items,
                total=grupa_total
            ))

        # Handle cheltuieli without grupa
        ungrouped = ch_by_grupa.get(None, [])
        if ungrouped:
            items = []
            ungrouped_total: dict[str, Decimal] = {}

            for ch in ungrouped:
                if ch.nomenclator_id:
                    nom_result = await db.execute(
                        select(Nomenclator.denumire).where(Nomenclator.id == ch.nomenclator_id)
                    )
                    denumire = nom_result.scalar_one_or_none() or "N/A"
                else:
                    denumire = ch.denumire_custom or "N/A"

                m = ch.moneda or 'RON'
                items.append(RaportCategorieItem(
                    denumire=denumire,
                    suma=ch.suma,
                    moneda=m,
                    neplatit=ch.neplatit,
                    verificat=ch.verificat,
                    cheltuiala_id=ch.id
                ))

                if ch.neplatit:
                    add_to_dict(cat_total_neplatit, m, ch.suma)
                else:
                    add_to_dict(cat_total_platit, m, ch.suma)
                    add_to_dict(ungrouped_total, m, ch.suma)

            grupe_report.append(RaportGrupa(
                grupa_id=None,
                grupa_nume="Alte",
                items=items,
                total=ungrouped_total
            ))

        if grupe_report:
            categorii_report.append(RaportCategorie(
                categorie_id=cat.id,
                categorie_nume=cat.nume,
                categorie_culoare=cat.culoare,
                afecteaza_sold=cat.afecteaza_sold,
                grupe=grupe_report,
                total_platit=cat_total_platit,
                total_neplatit=cat_total_neplatit,
                total=merge_dicts(cat_total_platit, cat_total_neplatit)
            ))

            if cat.afecteaza_sold:
                total_cheltuieli = merge_dicts(total_cheltuieli, cat_total_platit)
                total_neplatit = merge_dicts(total_neplatit, cat_total_neplatit)

    # Handle uncategorized cheltuieli
    unmatched = [ch for ch in cheltuieli if ch.id not in matched_ch_ids]
    if unmatched:
        items = []
        uncat_platit: dict[str, Decimal] = {}
        uncat_neplatit: dict[str, Decimal] = {}

        for ch in unmatched:
            if ch.nomenclator_id:
                nom_result = await db.execute(
                    select(Nomenclator.denumire).where(Nomenclator.id == ch.nomenclator_id)
                )
                denumire = nom_result.scalar_one_or_none() or "N/A"
            else:
                denumire = ch.denumire_custom or "N/A"

            m = ch.moneda or 'RON'
            items.append(RaportCategorieItem(
                denumire=denumire,
                suma=ch.suma,
                moneda=m,
                neplatit=ch.neplatit,
                verificat=ch.verificat,
                cheltuiala_id=ch.id
            ))

            if ch.neplatit:
                add_to_dict(uncat_neplatit, m, ch.suma)
            else:
                add_to_dict(uncat_platit, m, ch.suma)

        categorii_report.append(RaportCategorie(
            categorie_id=0,
            categorie_nume="Necategorizate",
            categorie_culoare="#9CA3AF",
            afecteaza_sold=True,
            grupe=[RaportGrupa(
                grupa_id=None,
                grupa_nume="Alte",
                items=items,
                total=uncat_platit
            )],
            total_platit=uncat_platit,
            total_neplatit=uncat_neplatit,
            total=merge_dicts(uncat_platit, uncat_neplatit)
        ))
        total_cheltuieli = merge_dicts(total_cheltuieli, uncat_platit)
        total_neplatit = merge_dicts(total_neplatit, uncat_neplatit)

    # Get portofele solduri
    port_result = await db.execute(
        select(Portofel)
        .where(Portofel.activ == True)
        .order_by(Portofel.ordine)
    )
    portofele = port_result.scalars().all()

    portofele_report = []
    total_sold: dict[str, Decimal] = {}

    for p in portofele:
        # Get alimentari grouped by moneda
        alim_result = await db.execute(
            select(Alimentare.moneda, func.coalesce(func.sum(Alimentare.suma), 0))
            .where(Alimentare.portofel_id == p.id, Alimentare.exercitiu_id == exercitiu.id)
            .group_by(Alimentare.moneda)
        )
        p_alimentari = {row[0]: row[1] for row in alim_result.all() if row[1]}

        # Get cheltuieli grouped by moneda (only categories with afecteaza_sold=True)
        ch_result = await db.execute(
            select(Cheltuiala.moneda, func.coalesce(func.sum(Cheltuiala.suma), 0))
            .outerjoin(Categorie, Cheltuiala.categorie_id == Categorie.id)
            .where(
                Cheltuiala.portofel_id == p.id,
                Cheltuiala.exercitiu_id == exercitiu.id,
                Cheltuiala.activ == True,
                Cheltuiala.sens == 'Cheltuiala',
                Cheltuiala.neplatit == False,
                or_(Categorie.afecteaza_sold == True, Cheltuiala.categorie_id == None)
            )
            .group_by(Cheltuiala.moneda)
        )
        p_cheltuieli = {row[0]: row[1] for row in ch_result.all() if row[1]}

        # Get incasari (sens='Incasare') — adds to sold
        inc_result = await db.execute(
            select(Cheltuiala.moneda, func.coalesce(func.sum(Cheltuiala.suma), 0))
            .outerjoin(Categorie, Cheltuiala.categorie_id == Categorie.id)
            .where(
                Cheltuiala.portofel_id == p.id,
                Cheltuiala.exercitiu_id == exercitiu.id,
                Cheltuiala.activ == True,
                Cheltuiala.sens == 'Incasare',
                Cheltuiala.neplatit == False,
                or_(Categorie.afecteaza_sold == True, Cheltuiala.categorie_id == None)
            )
            .group_by(Cheltuiala.moneda)
        )
        p_incasari = {row[0]: row[1] for row in inc_result.all() if row[1]}

        # Get transfers IN grouped by dest currency (use moneda_dest/suma_dest when set)
        tin_result = await db.execute(
            select(Transfer).where(Transfer.portofel_dest_id == p.id, Transfer.exercitiu_id == exercitiu.id)
        )
        p_transferuri_in: dict[str, Decimal] = {}
        for t in tin_result.scalars().all():
            m = t.moneda_dest or t.moneda or 'RON'
            s = t.suma_dest if t.moneda_dest else t.suma
            p_transferuri_in[m] = p_transferuri_in.get(m, Decimal("0")) + s

        # Get transfers OUT grouped by source moneda
        tout_result = await db.execute(
            select(Transfer.moneda, func.coalesce(func.sum(Transfer.suma), 0))
            .where(Transfer.portofel_sursa_id == p.id, Transfer.exercitiu_id == exercitiu.id)
            .group_by(Transfer.moneda)
        )
        p_transferuri_out = {row[0]: row[1] for row in tout_result.all() if row[1]}

        # Compute per-currency sold: ali - chelt + incasari + transf_in - transf_out
        all_currencies = set(list(p_alimentari.keys()) + list(p_cheltuieli.keys()) +
                            list(p_incasari.keys()) + list(p_transferuri_in.keys()) + list(p_transferuri_out.keys()))
        p_sold: dict[str, Decimal] = {}
        for currency in all_currencies:
            val = (p_alimentari.get(currency, Decimal("0"))
                   - p_cheltuieli.get(currency, Decimal("0"))
                   + p_incasari.get(currency, Decimal("0"))
                   + p_transferuri_in.get(currency, Decimal("0"))
                   - p_transferuri_out.get(currency, Decimal("0")))
            if val != Decimal("0"):
                p_sold[currency] = val

        # Accumulate into total_sold
        for currency, val in p_sold.items():
            total_sold[currency] = total_sold.get(currency, Decimal("0")) + val

        portofele_report.append(RaportPortofel(
            portofel_id=p.id,
            portofel_nume=p.nume,
            sold=p_sold,
            total_alimentari=p_alimentari,
            total_cheltuieli=p_cheltuieli,
            total_transferuri_in=p_transferuri_in,
            total_transferuri_out=p_transferuri_out
        ))

    # Filter out zero-value currencies
    total_sold_filtered = {k: v for k, v in total_sold.items() if v != Decimal("0")}
    total_cheltuieli_filtered = {k: v for k, v in total_cheltuieli.items() if v != Decimal("0")}
    total_neplatit_filtered = {k: v for k, v in total_neplatit.items() if v != Decimal("0")}

    return RaportZilnic(
        exercitiu_id=exercitiu.id,
        data=exercitiu.data,
        activ=exercitiu.activ,
        categorii=categorii_report,
        portofele=portofele_report,
        total_cheltuieli=total_cheltuieli_filtered,
        total_neplatit=total_neplatit_filtered,
        total_sold=total_sold_filtered
    )


@router.get("/rapoarte/perioada")
async def get_raport_perioada(
    data_start: date = Query(...),
    data_end: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Raport pentru o perioadă de zile
    Returnează lista de rapoarte zilnice
    """
    if data_start > data_end:
        raise HTTPException(status_code=400, detail="Data start trebuie să fie înainte de data end")
    
    if (data_end - data_start).days > 90:
        raise HTTPException(status_code=400, detail="Perioada maximă este de 90 de zile")
    
    # Get exercitii in range
    result = await db.execute(
        select(Exercitiu)
        .where(Exercitiu.data >= data_start, Exercitiu.data <= data_end)
        .order_by(Exercitiu.data.desc())
    )
    exercitii = result.scalars().all()
    
    rapoarte = []
    for ex in exercitii:
        raport = await get_raport_zilnic(exercitiu_id=ex.id, db=db, current_user=current_user)
        rapoarte.append(raport)
    
    return rapoarte

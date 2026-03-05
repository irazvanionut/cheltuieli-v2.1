"""
Comenzi Trends — pre-computed analytics for AnalizaComenziPage.

Worker loop: compute_daily_range + compute_heatmap every hour.
Endpoints read from pre-computed tables — no heavy queries at request time.
"""

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone, date as date_type

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, AsyncSessionLocal
from app.core.security import get_current_user
from app.models import Comanda

router = APIRouter(tags=["📈 Comenzi Trends"])

TZ_RO = timezone(timedelta(hours=2))
HEATMAP_DAYS = 90


# ─── Categorisire (identică cu comenzi.py) ────────────────────────────────────

def _cat(ship: str, info: str) -> str:
    if "RIDICARE" in (ship or "").upper():
        return "ridicare"
    if "Table:" in (info or ""):
        return "dinein"
    return "livrare"


# ─── Worker compute functions ─────────────────────────────────────────────────

async def compute_daily_range(session: AsyncSession, days: int = 90) -> None:
    """Compute/update comenzi_trends_daily for last `days` days."""
    now = datetime.now(TZ_RO)
    cutoff = (now - timedelta(days=days)).date()

    # Find days that need computing: missing or where max(synced_at) > computed_at
    existing = (await session.execute(text("""
        SELECT date, computed_at FROM comenzi_trends_daily
        WHERE date >= :cutoff
    """), {"cutoff": cutoff})).all()
    existing_map = {row.date: row.computed_at for row in existing}

    # Get all distinct dates in the window from comenzi
    dates_rows = (await session.execute(text("""
        SELECT DISTINCT DATE(created_at_erp AT TIME ZONE 'Europe/Bucharest') AS d
        FROM comenzi
        WHERE created_at_erp >= :cutoff
        ORDER BY d
    """), {"cutoff": datetime.combine(cutoff, datetime.min.time()).replace(tzinfo=TZ_RO)})).all()

    all_dates = [row.d for row in dates_rows]

    # Check which dates need recompute
    dates_to_compute = []
    for d in all_dates:
        if d not in existing_map:
            dates_to_compute.append(d)
        else:
            # Check if any comenzi were synced after computed_at
            comp_at = existing_map[d]
            stale_check = (await session.execute(text("""
                SELECT 1 FROM comenzi
                WHERE DATE(created_at_erp AT TIME ZONE 'Europe/Bucharest') = :d
                  AND synced_at > :comp_at
                LIMIT 1
            """), {"d": d, "comp_at": comp_at})).first()
            if stale_check:
                dates_to_compute.append(d)

    if not dates_to_compute:
        return

    for d in dates_to_compute:
        day_start = datetime.combine(d, datetime.min.time()).replace(tzinfo=TZ_RO)
        day_end = day_start + timedelta(days=1)

        rows = (await session.execute(
            select(Comanda.ship_to_address, Comanda.order_info, Comanda.total).where(
                Comanda.created_at_erp >= day_start,
                Comanda.created_at_erp < day_end,
            )
        )).all()

        count_total = count_dinein = count_livrare = count_ridicare = 0
        val_total = val_dinein = val_livrare = val_ridicare = 0.0

        for r in rows:
            cat = _cat(r.ship_to_address or "", r.order_info or "")
            val = float(r.total or 0)
            count_total += 1
            val_total += val
            if cat == "dinein":
                count_dinein += 1
                val_dinein += val
            elif cat == "livrare":
                count_livrare += 1
                val_livrare += val
            else:
                count_ridicare += 1
                val_ridicare += val

        await session.execute(text("""
            INSERT INTO comenzi_trends_daily
                (date, count_total, count_dinein, count_livrare, count_ridicare,
                 val_total, val_dinein, val_livrare, val_ridicare, computed_at)
            VALUES
                (:date, :ct, :cd, :cl, :cr, :vt, :vd, :vl, :vr, NOW())
            ON CONFLICT (date) DO UPDATE SET
                count_total   = EXCLUDED.count_total,
                count_dinein  = EXCLUDED.count_dinein,
                count_livrare = EXCLUDED.count_livrare,
                count_ridicare = EXCLUDED.count_ridicare,
                val_total     = EXCLUDED.val_total,
                val_dinein    = EXCLUDED.val_dinein,
                val_livrare   = EXCLUDED.val_livrare,
                val_ridicare  = EXCLUDED.val_ridicare,
                computed_at   = EXCLUDED.computed_at
        """), {
            "date": d,
            "ct": count_total, "cd": count_dinein, "cl": count_livrare, "cr": count_ridicare,
            "vt": round(val_total, 2), "vd": round(val_dinein, 2),
            "vl": round(val_livrare, 2), "vr": round(val_ridicare, 2),
        })

    await session.commit()
    print(f"[Trends] daily: computed {len(dates_to_compute)} days")


async def compute_heatmap(session: AsyncSession, days: int = 90) -> None:
    """Full recompute of comenzi_trends_heatmap (168 rows = 7x24)."""
    cutoff = datetime.now(TZ_RO) - timedelta(days=days)

    rows = (await session.execute(
        select(Comanda.created_at_erp, Comanda.ship_to_address, Comanda.order_info, Comanda.total).where(
            Comanda.created_at_erp >= cutoff,
        )
    )).all()

    # Accumulate per (dow, hour)
    buckets: dict[tuple, dict] = {}
    for dow in range(7):
        for hour in range(24):
            buckets[(dow, hour)] = {"ct": 0, "cd": 0, "cl": 0, "cr": 0, "val": 0.0}

    for r in rows:
        if not r.created_at_erp:
            continue
        local_dt = r.created_at_erp.astimezone(TZ_RO)
        dow = local_dt.weekday()  # 0=Mon … 6=Sun
        hour = local_dt.hour
        cat = _cat(r.ship_to_address or "", r.order_info or "")
        val = float(r.total or 0)
        b = buckets[(dow, hour)]
        b["ct"] += 1
        b["val"] += val
        if cat == "dinein":
            b["cd"] += 1
        elif cat == "livrare":
            b["cl"] += 1
        else:
            b["cr"] += 1

    # Full recompute — delete all first
    await session.execute(text("DELETE FROM comenzi_trends_heatmap"))

    for (dow, hour), b in buckets.items():
        val_avg = round(b["val"] / b["ct"], 2) if b["ct"] > 0 else 0.0
        await session.execute(text("""
            INSERT INTO comenzi_trends_heatmap
                (dow, hour, count_total, count_dinein, count_livrare, count_ridicare, val_avg, computed_at)
            VALUES (:dow, :hour, :ct, :cd, :cl, :cr, :va, NOW())
        """), {
            "dow": dow, "hour": hour,
            "ct": b["ct"], "cd": b["cd"], "cl": b["cl"], "cr": b["cr"], "va": val_avg,
        })

    await session.commit()
    print(f"[Trends] heatmap: computed {len(rows)} orders → 168 cells")


# ─── Worker loop ──────────────────────────────────────────────────────────────

async def comenzi_trends_loop() -> None:
    await asyncio.sleep(15)  # wait for DB init
    print("[Trends] loop started")
    while True:
        try:
            async with AsyncSessionLocal() as s:
                await compute_daily_range(s, days=HEATMAP_DAYS)
                await compute_heatmap(s, days=HEATMAP_DAYS)
            print("[Trends] compute done")
        except Exception as e:
            print(f"[Trends] error: {e}")
        await asyncio.sleep(3600)


# ─── Helper: linear projection ────────────────────────────────────────────────

def _linear_projection(dates_counts: list[tuple], n_days: int = 7) -> list[dict]:
    """Simple linear regression on (day_index, count) → project next n_days."""
    if len(dates_counts) < 2:
        return []

    n = len(dates_counts)
    xs = list(range(n))
    ys = [c for _, c in dates_counts]

    x_mean = sum(xs) / n
    y_mean = sum(ys) / n

    num = sum((xs[i] - x_mean) * (ys[i] - y_mean) for i in range(n))
    den = sum((xs[i] - x_mean) ** 2 for i in range(n))
    slope = num / den if den != 0 else 0
    intercept = y_mean - slope * x_mean

    last_date = dates_counts[-1][0]
    result = []
    for i in range(1, n_days + 1):
        proj_x = n - 1 + i
        proj_val = max(0.0, intercept + slope * proj_x)
        proj_date = last_date + timedelta(days=i)
        result.append({"data": proj_date.isoformat(), "projected": round(proj_val, 1)})
    return result


def _moving_avg(dates_counts: list[tuple], window: int = 3) -> list[dict]:
    """Compute moving average over daily counts."""
    result = []
    ys = [c for _, c in dates_counts]
    for i, (d, _) in enumerate(dates_counts):
        start = max(0, i - window + 1)
        avg = sum(ys[start:i + 1]) / (i - start + 1)
        result.append({"data": d.isoformat(), "avg": round(avg, 1)})
    return result


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/comenzi/trends")
async def get_trends(
    data_start: str = Query(..., description="YYYY-MM-DD"),
    data_end:   str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Returns current period stats vs previous period (same length), plus
    moving average and linear projection.
    """
    try:
        start = datetime.fromisoformat(data_start).date()
        end   = datetime.fromisoformat(data_end).date()
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Format dată invalid")

    n_days = (end - start).days + 1
    prev_end   = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=n_days - 1)

    # Fetch current period rows
    curr_rows = (await db.execute(text("""
        SELECT date, count_total, count_dinein, count_livrare, count_ridicare,
               val_total, val_dinein, val_livrare, val_ridicare
        FROM comenzi_trends_daily
        WHERE date >= :s AND date <= :e
        ORDER BY date
    """), {"s": start, "e": end})).all()

    prev_rows = (await db.execute(text("""
        SELECT count_total, count_dinein, count_livrare, count_ridicare, val_total
        FROM comenzi_trends_daily
        WHERE date >= :s AND date <= :e
    """), {"s": prev_start, "e": prev_end})).all()

    def _sum_rows(rows):
        ct = sum(r.count_total for r in rows)
        cd = sum(r.count_dinein for r in rows)
        cl = sum(r.count_livrare for r in rows)
        cr = sum(r.count_ridicare for r in rows)
        vt = sum(float(r.val_total) for r in rows)
        return {"total": ct, "dinein": cd, "livrare": cl, "ridicare": cr,
                "val_total": round(vt, 2),
                "val_medie": round(vt / ct, 2) if ct else 0.0}

    current  = _sum_rows(curr_rows)
    previous = _sum_rows(prev_rows)

    # Dacă perioada curentă include azi (incompletă), exclude azi din comparație
    # pentru a nu distorsiona procentele față de perioada anterioară.
    complete_curr_rows = [r for r in curr_rows if r.date < today]
    complete_prev_rows = prev_rows
    if complete_curr_rows and len(complete_curr_rows) < len(curr_rows):
        # Restrânge și prev la același număr de zile (ultimele n din perioadă)
        n_complete = len(complete_curr_rows)
        complete_prev_rows = list(prev_rows)[-n_complete:] if len(prev_rows) > n_complete else prev_rows
        curr_for_pct = _sum_rows(complete_curr_rows)
        prev_for_pct = _sum_rows(complete_prev_rows)
    else:
        curr_for_pct = current
        prev_for_pct = previous

    def _pct(curr_val, prev_val):
        if prev_val == 0:
            return None
        return round((curr_val - prev_val) / prev_val * 100, 1)

    pct = {
        "total":    _pct(curr_for_pct["total"],    prev_for_pct["total"]),
        "dinein":   _pct(curr_for_pct["dinein"],   prev_for_pct["dinein"]),
        "livrare":  _pct(curr_for_pct["livrare"],  prev_for_pct["livrare"]),
        "ridicare": _pct(curr_for_pct["ridicare"], prev_for_pct["ridicare"]),
        "val_total": _pct(curr_for_pct["val_total"], prev_for_pct["val_total"]),
    }

    today = datetime.now(TZ_RO).date()
    # Exclude today from moving avg + projection — ziua de azi e incompletă
    # și distorsionează regresia liniară (câteva comenzi → proiecție în scădere falsă).
    # Proiecția include ziua de azi ca prima valoare estimată.
    dates_counts_complete = [(r.date, r.count_total) for r in curr_rows if r.date < today]
    dates_counts_all      = [(r.date, r.count_total) for r in curr_rows]
    base = dates_counts_complete if len(dates_counts_complete) >= 2 else dates_counts_all

    moving_avg = _moving_avg(base, window=3)
    # Proiecție 7 zile de la ultima zi completă (prima zi proiectată = azi dacă baza e ieri)
    projection = _linear_projection(base, n_days=7)

    return {
        "current":    current,
        "previous":   previous,
        "pct":        pct,
        "moving_avg": moving_avg,
        "projection": projection,
        "prev_period": {"start": prev_start.isoformat(), "end": prev_end.isoformat()},
    }


@router.get("/comenzi/heatmap")
async def get_heatmap(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns 168-cell heatmap (dow × hour) normalized 0.0–1.0."""
    rows = (await db.execute(text("""
        SELECT dow, hour, count_total, count_dinein, count_livrare, count_ridicare,
               val_avg, computed_at
        FROM comenzi_trends_heatmap
        ORDER BY dow, hour
    """))).all()

    if not rows:
        return {"cells": [], "computed_at": None, "days_window": HEATMAP_DAYS}

    max_count = max((r.count_total for r in rows), default=1) or 1
    computed_at = max((r.computed_at for r in rows if r.computed_at), default=None)

    cells = [
        {
            "dow":      r.dow,
            "hour":     r.hour,
            "count":    r.count_total,
            "dinein":   r.count_dinein,
            "livrare":  r.count_livrare,
            "ridicare": r.count_ridicare,
            "val_avg":  float(r.val_avg or 0),
            "intensity": round(r.count_total / max_count, 3),
        }
        for r in rows
    ]

    return {
        "cells": cells,
        "computed_at": computed_at.isoformat() if computed_at else None,
        "days_window": HEATMAP_DAYS,
    }


@router.get("/comenzi/produse-heatmap")
async def get_produse_heatmap(
    data_start: str = Query(..., description="YYYY-MM-DD"),
    data_end:   str = Query(..., description="YYYY-MM-DD"),
    limit: int  = Query(20, ge=5, le=50),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    For each top product (by qty), returns 24-slot hour distribution and
    7-slot day-of-week distribution. Used to render product heatmaps.
    """
    try:
        start = datetime.fromisoformat(data_start).replace(
            hour=0, minute=0, second=0, microsecond=0, tzinfo=TZ_RO)
        end   = datetime.fromisoformat(data_end).replace(
            hour=23, minute=59, second=59, microsecond=0, tzinfo=TZ_RO)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Format dată invalid")

    rows = (await db.execute(text("""
        SELECT
            cl.product_name,
            EXTRACT(HOUR FROM c.created_at_erp AT TIME ZONE 'Europe/Bucharest')::int AS hour,
            (EXTRACT(ISODOW FROM c.created_at_erp AT TIME ZONE 'Europe/Bucharest')::int - 1) AS dow,
            SUM(cl.quantity)::float AS qty
        FROM comenzi_linii cl
        JOIN comenzi c ON c.id = cl.comanda_id
        WHERE c.created_at_erp >= :start AND c.created_at_erp <= :end
          AND c.linii_synced = TRUE
          AND cl.product_name IS NOT NULL
        GROUP BY cl.product_name, hour, dow
    """), {"start": start, "end": end})).all()

    totals: dict[str, float] = defaultdict(float)
    by_hour: dict[str, list] = {}
    by_dow:  dict[str, list] = {}

    for r in rows:
        name = r.product_name
        if name not in by_hour:
            by_hour[name] = [0.0] * 24
            by_dow[name]  = [0.0] * 7
        qty = float(r.qty or 0)
        by_hour[name][r.hour] += qty
        by_dow[name][r.dow]   += qty
        totals[name]           += qty

    top = [name for name, _ in sorted(totals.items(), key=lambda x: -x[1])[:limit]]

    return {
        "produse":  top,
        "by_hour":  {p: by_hour[p] for p in top},
        "by_dow":   {p: by_dow[p]  for p in top},
        "totals":   {p: totals[p]  for p in top},
    }


@router.get("/orders/produse-trends")
async def get_produse_trends(
    data_start: str = Query(..., description="YYYY-MM-DD"),
    data_end:   str = Query(..., description="YYYY-MM-DD"),
    limit: int  = Query(30, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Top products with trend vs previous period (same length)."""
    try:
        start = datetime.fromisoformat(data_start).replace(
            hour=0, minute=0, second=0, microsecond=0, tzinfo=TZ_RO)
        end   = datetime.fromisoformat(data_end).replace(
            hour=23, minute=59, second=59, microsecond=0, tzinfo=TZ_RO)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Format dată invalid")

    n_days = (end.date() - start.date()).days + 1
    prev_end   = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=n_days - 1)

    _query = """
        SELECT
            cl.product_name,
            cl.product_group,
            SUM(cl.quantity)  AS qty_total,
            SUM(cl.total)     AS val_total,
            COUNT(DISTINCT cl.comanda_id) AS nr_comenzi
        FROM comenzi_linii cl
        JOIN comenzi c ON c.id = cl.comanda_id
        WHERE c.created_at_erp >= :start_dt
          AND c.created_at_erp <= :end_dt
          AND c.linii_synced = TRUE
          AND cl.product_name IS NOT NULL
        GROUP BY cl.product_name, cl.product_group
        ORDER BY qty_total DESC
        LIMIT :limit
    """

    curr_rows = (await db.execute(text(_query), {
        "start_dt": start, "end_dt": end, "limit": limit
    })).all()

    prev_rows = (await db.execute(text(_query), {
        "start_dt": prev_start, "end_dt": prev_end, "limit": limit * 2
    })).all()

    prev_map = {r.product_name: float(r.qty_total or 0) for r in prev_rows}

    produse = []
    for r in curr_rows:
        curr_qty = float(r.qty_total or 0)
        prev_qty = prev_map.get(r.product_name, 0.0)

        if prev_qty == 0:
            trend = "new"
            pct_change = None
        else:
            pct = (curr_qty - prev_qty) / prev_qty * 100
            pct_change = round(pct, 1)
            if pct > 5:
                trend = "up"
            elif pct < -5:
                trend = "down"
            else:
                trend = "stable"

        produse.append({
            "product_name":  r.product_name,
            "product_group": r.product_group,
            "qty_total":     curr_qty,
            "qty_prev":      prev_qty,
            "val_total":     round(float(r.val_total or 0), 2),
            "nr_comenzi":    r.nr_comenzi,
            "trend":         trend,
            "pct_change":    pct_change,
        })

    return {
        "produse": produse,
        "prev_period": {
            "start": prev_start.date().isoformat(),
            "end":   prev_end.date().isoformat(),
        },
    }

from fastapi import APIRouter, Depends, Query, HTTPException
from datetime import datetime, date, timedelta
from typing import Optional
import statistics

from sqlalchemy import select, func as sa_func, delete

from app.core.security import get_current_user, require_admin
from app.core.database import AsyncSessionLocal
from app.models import ApeluriZilnic, ApeluriDetalii, AmiApel

router = APIRouter(tags=["apeluri"])


def percentile(sorted_list: list[int], p: float) -> int:
    """Calculate p-th percentile from a pre-sorted list."""
    if not sorted_list:
        return 0
    k = (len(sorted_list) - 1) * (p / 100)
    f = int(k)
    c = f + 1
    if c >= len(sorted_list):
        return sorted_list[f]
    return int(sorted_list[f] + (k - f) * (sorted_list[c] - sorted_list[f]))


def compute_stats(call_list: list[dict]) -> dict:
    """Compute comprehensive statistics from parsed calls."""
    answered = [c for c in call_list if c["status"] == "COMPLETAT"]
    abandoned = [c for c in call_list if c["status"] == "ABANDONAT"]
    total = len(call_list)

    # Hold times
    hold_answered = sorted([c["hold_time"] for c in answered])
    hold_abandoned = sorted([c["hold_time"] for c in abandoned])
    call_times = sorted([c["call_time"] for c in answered if c["call_time"] > 0])

    def time_stats(values: list[int]) -> dict:
        if not values:
            return {"avg": 0, "median": 0, "p90": 0, "min": 0, "max": 0}
        return {
            "avg": round(statistics.mean(values)),
            "median": round(statistics.median(values)),
            "p90": percentile(values, 90),
            "min": min(values),
            "max": max(values),
        }

    # ASA = Average Speed of Answer
    asa = round(statistics.mean(hold_answered)) if hold_answered else 0

    # Hourly distribution (0-23)
    hourly: dict[int, dict] = {}
    for h in range(24):
        hourly[h] = {"total": 0, "answered": 0, "abandoned": 0, "hold_sum": 0}

    for c in call_list:
        ora = c.get("ora", "")
        if not ora:
            continue
        try:
            hour = int(ora.split(":")[0])
        except (ValueError, IndexError):
            continue
        hourly[hour]["total"] += 1
        if c["status"] == "COMPLETAT":
            hourly[hour]["answered"] += 1
            hourly[hour]["hold_sum"] += c["hold_time"]
        elif c["status"] == "ABANDONAT":
            hourly[hour]["abandoned"] += 1

    hourly_list = []
    for h in range(24):
        d = hourly[h]
        if d["total"] == 0:
            continue
        answer_rate = round(d["answered"] / d["total"] * 100) if d["total"] > 0 else 0
        hour_asa = round(d["hold_sum"] / d["answered"]) if d["answered"] > 0 else 0
        abandon_rate = round(d["abandoned"] / d["total"] * 100) if d["total"] > 0 else 0
        hourly_list.append({
            "hour": h,
            "label": f"{h:02d}:00",
            "total": d["total"],
            "answered": d["answered"],
            "abandoned": d["abandoned"],
            "answer_rate": answer_rate,
            "abandon_rate": abandon_rate,
            "asa": hour_asa,
        })

    return {
        "total": total,
        "answered": len(answered),
        "abandoned": len(abandoned),
        "answer_rate": round(len(answered) / total * 100) if total > 0 else 0,
        "abandon_rate": round(len(abandoned) / total * 100) if total > 0 else 0,
        "asa": asa,
        "waited_over_30": sum(1 for c in call_list if c["hold_time"] > 30),
        "hold_answered": time_stats(hold_answered),
        "hold_abandoned": time_stats(hold_abandoned),
        "call_duration": time_stats(call_times),
        "hourly": hourly_list,
    }




@router.get("/apeluri/primite")
async def get_apeluri_primite(
    data: Optional[str] = Query(None, description="Data in format YYYY-MM-DD or YYYYMMDD"),
    current_user=Depends(get_current_user),
):
    """Get received calls from ami_apeluri table (same source as Lista Apeluri)."""
    # Normalize date param (accept both YYYYMMDD and YYYY-MM-DD)
    today = date.today()
    if data:
        data_clean = data.strip()
        if len(data_clean) == 8 and data_clean.isdigit():
            data_clean = f"{data_clean[:4]}-{data_clean[4:6]}-{data_clean[6:]}"
        try:
            target_date = date.fromisoformat(data_clean)
        except ValueError:
            target_date = today
    else:
        target_date = today

    # Import live state from lista_apeluri module
    from app.api.lista_apeluri import _ami_active
    now_ts = datetime.now().timestamp()

    # Build active calls for the target date
    call_list: list[dict] = []
    active_uids: set[str] = set()
    for uid, c in _ami_active.items():
        if c.get("data", "") != target_date.isoformat():
            continue
        elapsed = int(now_ts - c.get("ts_enter", now_ts))
        call_list.append({
            "callid": uid,
            "queue": c.get("queue", ""),
            "caller_id": c.get("caller_id", ""),
            "agent": c.get("agent", ""),
            "status": c.get("status", "IN_QUEUE"),
            "ora": c.get("ora", ""),
            "hold_time": elapsed if c.get("status") == "IN_QUEUE" else c.get("hold_time", 0),
            "call_time": max(0, int(elapsed - c.get("hold_time", 0)))
                         if c.get("status") == "IN_CURS" else 0,
        })
        active_uids.add(uid)

    # Query completed/abandoned calls from DB
    async with AsyncSessionLocal() as session:
        stmt = (
            select(AmiApel)
            .where(AmiApel.data == target_date)
            .where(AmiApel.status.in_(["COMPLETAT", "ABANDONAT"]))
            .order_by(AmiApel.ora.desc())
        )
        rows = (await session.execute(stmt)).scalars().all()

    for r in rows:
        if r.callid in active_uids:
            continue
        call_list.append({
            "callid": r.callid,
            "queue": r.queue or "",
            "caller_id": r.caller_id or "",
            "agent": r.agent or "",
            "status": r.status,
            "ora": r.ora or "",
            "hold_time": r.hold_time or 0,
            "call_time": r.call_time or 0,
        })

    call_list.sort(key=lambda c: c["ora"], reverse=True)

    summary: dict[str, int] = {}
    for call in call_list:
        st = call["status"]
        summary[st] = summary.get(st, 0) + 1

    return {
        "summary": summary,
        "calls": call_list,
        "total": len(call_list),
        "stats": compute_stats(call_list),
        "data": target_date.isoformat(),
    }


# ============================================
# ISTORIC APELURI (from DB)
# ============================================

@router.get("/apeluri/istoric")
async def get_apeluri_istoric(
    data_start: Optional[str] = Query(None, description="YYYY-MM-DD"),
    data_end: Optional[str] = Query(None, description="YYYY-MM-DD"),
    limit: int = Query(30, ge=1, le=365),
    current_user=Depends(get_current_user),
):
    """List saved daily summaries."""
    async with AsyncSessionLocal() as session:
        query = select(ApeluriZilnic).order_by(ApeluriZilnic.data.desc())

        if data_start:
            query = query.where(ApeluriZilnic.data >= date.fromisoformat(data_start))
        if data_end:
            query = query.where(ApeluriZilnic.data <= date.fromisoformat(data_end))

        query = query.limit(limit)
        result = await session.execute(query)
        rows = result.scalars().all()

        return [
            {
                "id": r.id,
                "data": r.data.isoformat(),
                "total": r.total,
                "answered": r.answered,
                "abandoned": r.abandoned,
                "answer_rate": r.answer_rate,
                "abandon_rate": r.abandon_rate,
                "asa": r.asa,
                "waited_over_30": r.waited_over_30,
                "hold_answered_avg": r.hold_answered_avg,
                "hold_answered_median": r.hold_answered_median,
                "hold_answered_p90": r.hold_answered_p90,
                "hold_abandoned_avg": r.hold_abandoned_avg,
                "hold_abandoned_median": r.hold_abandoned_median,
                "hold_abandoned_p90": r.hold_abandoned_p90,
                "call_duration_avg": r.call_duration_avg,
                "call_duration_median": r.call_duration_median,
                "call_duration_p90": r.call_duration_p90,
                "hourly_data": r.hourly_data,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]


@router.get("/apeluri/istoric/{id}")
async def get_apeluri_istoric_detalii(
    id: int,
    current_user=Depends(get_current_user),
):
    """Get a specific day's summary + individual call details."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ApeluriZilnic)
            .options(selectinload(ApeluriZilnic.detalii))
            .where(ApeluriZilnic.id == id)
        )
        zilnic = result.scalar_one_or_none()

        if not zilnic:
            raise HTTPException(status_code=404, detail="Record not found")

        return {
            "id": zilnic.id,
            "data": zilnic.data.isoformat(),
            "total": zilnic.total,
            "answered": zilnic.answered,
            "abandoned": zilnic.abandoned,
            "answer_rate": zilnic.answer_rate,
            "abandon_rate": zilnic.abandon_rate,
            "asa": zilnic.asa,
            "waited_over_30": zilnic.waited_over_30,
            "hold_answered_avg": zilnic.hold_answered_avg,
            "hold_answered_median": zilnic.hold_answered_median,
            "hold_answered_p90": zilnic.hold_answered_p90,
            "hold_abandoned_avg": zilnic.hold_abandoned_avg,
            "hold_abandoned_median": zilnic.hold_abandoned_median,
            "hold_abandoned_p90": zilnic.hold_abandoned_p90,
            "call_duration_avg": zilnic.call_duration_avg,
            "call_duration_median": zilnic.call_duration_median,
            "call_duration_p90": zilnic.call_duration_p90,
            "hourly_data": zilnic.hourly_data,
            "detalii": [
                {
                    "id": d.id,
                    "callid": d.callid,
                    "caller_id": d.caller_id,
                    "agent": d.agent,
                    "status": d.status,
                    "ora": d.ora,
                    "hold_time": d.hold_time,
                    "call_time": d.call_time,
                }
                for d in sorted(zilnic.detalii, key=lambda x: x.ora or "", reverse=True)
            ],
        }


@router.get("/apeluri/trend-zilnic")
async def get_apeluri_trend_zilnic(
    days: int = Query(14, ge=2, le=90),
    current_user=Depends(get_current_user),
):
    """Return daily trend data for the last N days + 7-day averages."""
    async with AsyncSessionLocal() as session:
        cutoff = date.today() - timedelta(days=days)
        result = await session.execute(
            select(ApeluriZilnic)
            .where(ApeluriZilnic.data >= cutoff)
            .order_by(ApeluriZilnic.data.asc())
        )
        rows = result.scalars().all()

        data_points = []
        for r in rows:
            data_points.append({
                "data": r.data.isoformat(),
                "total": r.total,
                "answered": r.answered,
                "abandoned": r.abandoned,
                "answer_rate": r.answer_rate,
                "abandon_rate": r.abandon_rate,
                "asa": r.asa,
                "waited_over_30": r.waited_over_30,
                "call_duration_avg": r.call_duration_avg,
            })

        # Calculate 7-day averages from the data
        avg_7_days = {}
        if len(data_points) >= 2:
            last_7 = data_points[-7:] if len(data_points) >= 7 else data_points
            for key in ["total", "answered", "abandoned", "answer_rate", "abandon_rate", "asa", "waited_over_30", "call_duration_avg"]:
                vals = [d[key] for d in last_7]
                avg_7_days[key] = round(sum(vals) / len(vals)) if vals else 0

        return {
            "days": data_points,
            "avg_7_days": avg_7_days,
        }


@router.post("/apeluri/istoric/salveaza")
async def salveaza_apeluri_manual(
    data_str: Optional[str] = Query(None, description="YYYY-MM-DD, default today"),
    current_user=Depends(require_admin),
):
    """Manually trigger saving call data for a specific date (admin only)."""
    from app.main import do_save_apeluri

    target = date.fromisoformat(data_str) if data_str else date.today()
    await do_save_apeluri(target)
    return {"status": "ok", "data": target.isoformat()}

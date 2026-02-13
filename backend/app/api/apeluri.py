from fastapi import APIRouter, Depends, Query, HTTPException
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Optional
import statistics

from sqlalchemy import select, func as sa_func, delete
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_admin
from app.core.database import AsyncSessionLocal
from app.models import ApeluriZilnic, ApeluriDetalii

router = APIRouter(tags=["apeluri"])

QUEUE_LOG_DIR = Path("/mnt/asterisk")


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


def parse_queue_log(file_path: Path) -> dict:
    """Parse an Asterisk queue_log file and return call summary + details + stats."""
    calls: dict[str, dict] = {}  # callid -> call info

    if not file_path.exists():
        return {"summary": {}, "calls": [], "total": 0, "stats": compute_stats([])}

    with open(file_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("|")
            if len(parts) < 5:
                continue

            timestamp = parts[0]
            callid = parts[1]
            queuename = parts[2]
            agent = parts[3]
            event = parts[4]
            data_fields = parts[5:] if len(parts) > 5 else []

            # Skip non-call events
            if callid == "NONE" or event == "CONFIGRELOAD":
                continue

            if callid not in calls:
                calls[callid] = {
                    "callid": callid,
                    "queue": queuename,
                    "caller_id": "",
                    "agent": "",
                    "status": "",
                    "enter_time": None,
                    "connect_time": None,
                    "end_time": None,
                    "hold_time": 0,
                    "call_time": 0,
                    "events": [],
                }

            call = calls[callid]

            try:
                ts = int(timestamp)
            except ValueError:
                continue

            if event == "ENTERQUEUE":
                call["enter_time"] = ts
                if len(data_fields) >= 2:
                    call["caller_id"] = data_fields[1]
                call["status"] = "IN_QUEUE"

            elif event == "CONNECT":
                call["connect_time"] = ts
                call["agent"] = agent.replace("SIP/", "")
                if data_fields:
                    try:
                        call["hold_time"] = int(data_fields[0])
                    except (ValueError, IndexError):
                        pass
                call["status"] = "CONNECTED"

            elif event in ("COMPLETEAGENT", "COMPLETECALLER"):
                call["end_time"] = ts
                call["agent"] = agent.replace("SIP/", "")
                if len(data_fields) >= 2:
                    try:
                        call["hold_time"] = int(data_fields[0])
                        call["call_time"] = int(data_fields[1])
                    except (ValueError, IndexError):
                        pass
                call["status"] = "COMPLETAT"

            elif event == "ABANDON":
                call["end_time"] = ts
                if len(data_fields) >= 3:
                    try:
                        call["hold_time"] = int(data_fields[2])
                    except (ValueError, IndexError):
                        pass
                call["status"] = "ABANDONAT"

            elif event == "RINGNOANSWER":
                # Don't override a completed/abandoned status
                if call["status"] not in ("COMPLETAT", "ABANDONAT"):
                    call["status"] = "NEPRELUATE"

            call["events"].append(event)

    # Finalize: if still IN_QUEUE or CONNECTED, mark as active
    for call in calls.values():
        if call["status"] in ("IN_QUEUE", "CONNECTED", ""):
            call["status"] = "IN_CURS"

    # Build result list sorted by enter_time
    call_list = []
    for call in calls.values():
        enter_dt = datetime.fromtimestamp(call["enter_time"]).strftime("%H:%M:%S") if call["enter_time"] else ""
        call_list.append({
            "callid": call["callid"],
            "queue": call["queue"],
            "caller_id": call["caller_id"],
            "agent": call["agent"],
            "status": call["status"],
            "ora": enter_dt,
            "hold_time": call["hold_time"],
            "call_time": call["call_time"],
        })

    call_list.sort(key=lambda c: c["ora"], reverse=True)

    # Build summary
    summary = {}
    for call in call_list:
        st = call["status"]
        summary[st] = summary.get(st, 0) + 1

    return {
        "summary": summary,
        "calls": call_list,
        "total": len(call_list),
        "stats": compute_stats(call_list),
    }


@router.get("/apeluri/primite")
async def get_apeluri_primite(
    data: Optional[str] = Query(None, description="Data in format YYYYMMDD"),
    current_user=Depends(get_current_user),
):
    """Get received calls from Asterisk queue_log for a given date (default: today).
    queue_log = current day, queue_log-YYYYMMDD = archive."""
    today = date.today().strftime("%Y%m%d")

    if data and data != today:
        # Historical date — use archived file
        file_path = QUEUE_LOG_DIR / f"queue_log-{data}"
    else:
        # Today — use the active queue_log file, fallback to dated file
        data = today
        file_path = QUEUE_LOG_DIR / "queue_log"
        if not file_path.exists():
            file_path = QUEUE_LOG_DIR / f"queue_log-{today}"

    result = parse_queue_log(file_path)
    result["data"] = data

    return result


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

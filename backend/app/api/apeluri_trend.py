"""Trend analysis for historical call data from Asterisk CDR Master.csv"""

import csv
import statistics
from collections import defaultdict
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.security import get_current_user

router = APIRouter(tags=["apeluri"])

MASTER_CSV = Path("/mnt/asterisk/Master.csv")

# Column indices in Master.csv (no header row)
# accountcode[0], src[1], dst[2], dcontext[3], clid[4], channel[5],
# dstchannel[6], lastapp[7], lastdata[8], start[9], answer[10], end[11],
# duration[12], billsec[13], disposition[14], amaflags[15], uniqueid[16], userfield[17]
COL_SRC = 1
COL_LASTAPP = 7
COL_LASTDATA = 8
COL_START = 9
COL_DURATION = 12
COL_BILLSEC = 13
COL_DISPOSITION = 14


def parse_master_csv(
    file_path: Path,
    days: Optional[int] = None,
) -> list[dict]:
    """Parse Master.csv and return queue calls only."""
    if not file_path.exists():
        return []

    cutoff = None
    if days:
        cutoff = datetime.now() - timedelta(days=days)

    rows = []
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) < 16:
                continue
            # Only queue calls (lastapp=Queue, lastdata starts with comenzi)
            if row[COL_LASTAPP] != "Queue":
                continue
            if not row[COL_LASTDATA].startswith("comenzi"):
                continue

            try:
                start_dt = datetime.strptime(row[COL_START], "%Y-%m-%d %H:%M:%S")
            except (ValueError, IndexError):
                continue

            if cutoff and start_dt < cutoff:
                continue

            src = row[COL_SRC].strip()
            if not src or len(src) < 4:
                continue

            try:
                duration = int(row[COL_DURATION])
                billsec = int(row[COL_BILLSEC])
            except (ValueError, IndexError):
                duration = 0
                billsec = 0

            wait_time = max(duration - billsec, 0)
            disposition = row[COL_DISPOSITION].strip()

            rows.append({
                "src": src,
                "start": start_dt,
                "date": start_dt.date().isoformat(),
                "hour": start_dt.hour,
                "week": start_dt.isocalendar()[1],
                "year_week": f"{start_dt.isocalendar()[0]}-W{start_dt.isocalendar()[1]:02d}",
                "duration": duration,
                "billsec": billsec,
                "wait_time": wait_time,
                "disposition": disposition,
                "answered": disposition == "ANSWERED",
            })

    return rows


def percentile_val(sorted_list: list, p: float):
    if not sorted_list:
        return 0
    k = (len(sorted_list) - 1) * (p / 100)
    f = int(k)
    c = min(f + 1, len(sorted_list) - 1)
    return int(sorted_list[f] + (k - f) * (sorted_list[c] - sorted_list[f]))


def linear_trend(values: list[float]) -> str:
    """Simple linear regression slope direction."""
    n = len(values)
    if n < 3:
        return "stabil"
    x = list(range(n))
    x_mean = sum(x) / n
    y_mean = sum(values) / n
    num = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, values))
    den = sum((xi - x_mean) ** 2 for xi in x)
    if den == 0:
        return "stabil"
    slope = num / den
    # Normalize by mean to get relative change
    if y_mean == 0:
        return "stabil"
    rel = slope / y_mean
    if rel > 0.08:
        return "crestere"
    elif rel < -0.08:
        return "scadere"
    return "stabil"


def compute_trend_stats(rows: list[dict]) -> dict:
    """Compute all trend statistics from parsed CDR rows."""
    if not rows:
        return {"error": "Nu exista date"}

    total = len(rows)
    answered = [r for r in rows if r["answered"]]
    not_answered = [r for r in rows if not r["answered"]]

    # --- Basic stats ---
    wait_times_all = sorted([r["wait_time"] for r in rows])
    wait_times_answered = sorted([r["wait_time"] for r in answered])
    billsecs = sorted([r["billsec"] for r in answered if r["billsec"] > 0])

    def time_stats(vals):
        if not vals:
            return {"avg": 0, "median": 0, "p50": 0, "p75": 0, "p90": 0, "min": 0, "max": 0}
        return {
            "avg": round(statistics.mean(vals)),
            "median": round(statistics.median(vals)),
            "p50": percentile_val(vals, 50),
            "p75": percentile_val(vals, 75),
            "p90": percentile_val(vals, 90),
            "min": min(vals),
            "max": max(vals),
        }

    # --- Top 20 numbers ---
    by_src: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_src[r["src"]].append(r)

    top20 = sorted(by_src.items(), key=lambda x: len(x[1]), reverse=True)[:20]
    top20_list = []
    for src, calls in top20:
        total_dur = sum(c["billsec"] for c in calls)
        avg_dur = round(total_dur / len(calls)) if calls else 0
        avg_wait = round(sum(c["wait_time"] for c in calls) / len(calls)) if calls else 0
        top20_list.append({
            "src": src,
            "count": len(calls),
            "total_duration": total_dur,
            "avg_duration": avg_dur,
            "avg_wait": avg_wait,
            "first_call": min(c["date"] for c in calls),
            "last_call": max(c["date"] for c in calls),
        })

    # --- Frequency buckets ---
    freq_1 = sum(1 for calls in by_src.values() if len(calls) == 1)
    freq_2_5 = sum(1 for calls in by_src.values() if 2 <= len(calls) <= 5)
    freq_6_10 = sum(1 for calls in by_src.values() if 6 <= len(calls) <= 10)
    freq_11_plus = sum(1 for calls in by_src.values() if len(calls) > 10)

    # --- Hourly distribution ---
    hourly = defaultdict(lambda: {"total": 0, "answered": 0})
    for r in rows:
        hourly[r["hour"]]["total"] += 1
        if r["answered"]:
            hourly[r["hour"]]["answered"] += 1

    hourly_list = []
    for h in range(24):
        d = hourly[h]
        if d["total"] == 0:
            continue
        hourly_list.append({
            "hour": h,
            "label": f"{h:02d}:00",
            "total": d["total"],
            "answered": d["answered"],
            "answer_rate": round(d["answered"] / d["total"] * 100) if d["total"] > 0 else 0,
        })

    # --- Weekly trend ---
    by_week: dict[str, dict] = defaultdict(lambda: {"total": 0, "answered": 0, "wait_sum": 0})
    for r in rows:
        w = r["year_week"]
        by_week[w]["total"] += 1
        if r["answered"]:
            by_week[w]["answered"] += 1
        by_week[w]["wait_sum"] += r["wait_time"]

    weekly_list = []
    for w in sorted(by_week.keys()):
        d = by_week[w]
        weekly_list.append({
            "week": w,
            "total": d["total"],
            "answered": d["answered"],
            "answer_rate": round(d["answered"] / d["total"] * 100) if d["total"] > 0 else 0,
            "avg_wait": round(d["wait_sum"] / d["total"]) if d["total"] > 0 else 0,
        })

    # --- Number trends (5+ calls, weekly) ---
    trends_crestere = []
    trends_scadere = []
    trends_stabil = []
    trends_churn = []

    all_weeks = sorted(by_week.keys())
    recent_weeks = set(all_weeks[-4:]) if len(all_weeks) >= 4 else set(all_weeks)
    old_weeks = set(all_weeks[:max(len(all_weeks) // 2, 1)])

    for src, calls in by_src.items():
        if len(calls) < 5:
            continue

        # Weekly counts for this number
        src_weekly: dict[str, int] = defaultdict(int)
        for c in calls:
            src_weekly[c["year_week"]] += 1

        weekly_counts = [src_weekly.get(w, 0) for w in all_weeks]
        trend = linear_trend(weekly_counts)

        avg_wait_src = round(sum(c["wait_time"] for c in calls) / len(calls))
        info = {
            "src": src,
            "total_calls": len(calls),
            "trend": trend,
            "avg_wait": avg_wait_src,
            "first_call": min(c["date"] for c in calls),
            "last_call": max(c["date"] for c in calls),
        }

        if trend == "crestere":
            trends_crestere.append(info)
        elif trend == "scadere":
            trends_scadere.append(info)
        else:
            trends_stabil.append(info)

        # Churn detection: active in old weeks, absent in recent weeks
        old_count = sum(src_weekly.get(w, 0) for w in old_weeks)
        recent_count = sum(src_weekly.get(w, 0) for w in recent_weeks)
        if old_count >= 3 and recent_count == 0:
            info_churn = {**info, "old_calls": old_count, "recent_calls": recent_count}
            trends_churn.append(info_churn)

    trends_crestere.sort(key=lambda x: x["total_calls"], reverse=True)
    trends_scadere.sort(key=lambda x: x["total_calls"], reverse=True)
    trends_churn.sort(key=lambda x: x["old_calls"], reverse=True)

    # --- Wait time evolution (weekly) ---
    wait_evolution = []
    for w in sorted(by_week.keys()):
        week_rows = [r for r in rows if r["year_week"] == w]
        week_waits = sorted([r["wait_time"] for r in week_rows])
        if week_waits:
            wait_evolution.append({
                "week": w,
                "avg": round(statistics.mean(week_waits)),
                "median": round(statistics.median(week_waits)),
                "p90": percentile_val(week_waits, 90),
            })

    # --- Top callers vs general wait ---
    general_avg_wait = round(statistics.mean(wait_times_all)) if wait_times_all else 0
    top_callers_wait = []
    for src, calls in sorted(by_src.items(), key=lambda x: len(x[1]), reverse=True)[:10]:
        avg_w = round(sum(c["wait_time"] for c in calls) / len(calls))
        top_callers_wait.append({
            "src": src,
            "count": len(calls),
            "avg_wait": avg_w,
            "diff_vs_general": avg_w - general_avg_wait,
        })

    # --- Date range ---
    dates = [r["date"] for r in rows]

    return {
        "period": {"from": min(dates), "to": max(dates), "total_days": len(set(dates))},
        "basic": {
            "total": total,
            "answered": len(answered),
            "not_answered": len(not_answered),
            "answer_rate": round(len(answered) / total * 100) if total > 0 else 0,
            "unique_numbers": len(by_src),
        },
        "wait_time": time_stats(wait_times_all),
        "wait_time_answered": time_stats(wait_times_answered),
        "call_duration": time_stats(billsecs),
        "frequency_buckets": {
            "single": freq_1,
            "from_2_to_5": freq_2_5,
            "from_6_to_10": freq_6_10,
            "over_10": freq_11_plus,
        },
        "top20": top20_list,
        "hourly": hourly_list,
        "weekly": weekly_list[-52:],  # Last year of weeks
        "wait_evolution": wait_evolution[-52:],
        "trends": {
            "crestere": trends_crestere[:15],
            "scadere": trends_scadere[:15],
            "stabil_count": len(trends_stabil),
            "churn": trends_churn[:15],
        },
        "top_callers_wait": top_callers_wait,
        "general_avg_wait": general_avg_wait,
    }


@router.get("/apeluri/trend")
async def get_apeluri_trend(
    days: Optional[int] = Query(None, description="Limiteaza la ultimele N zile"),
    current_user=Depends(get_current_user),
):
    """Historical call trend analysis from CDR Master.csv."""
    rows = parse_master_csv(MASTER_CSV, days=days)
    return compute_trend_stats(rows)

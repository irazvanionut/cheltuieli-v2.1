from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import json
from datetime import datetime, date, time, timedelta
from pathlib import Path
from sqlalchemy import select, delete

from app.core.config import settings
from app.core.database import init_db, AsyncSessionLocal
from app.core.log import write_log
from app.models import Exercitiu, ApeluriZilnic, ApeluriDetalii, MapPin
from app.api import api_router
from app.api.apeluri import compute_stats
from app.models import AmiApel
from app.api.lista_apeluri import ami_event_loop
from app.api.pontaj import pontaj_fetch_loop
from app.api.google_reviews import do_refresh as google_reviews_refresh, do_analysis as google_reviews_analyze, do_fetch_serpapi_account, do_negative_analysis as google_reviews_negative_analyze
from app.api.competitori import competitor_scrape_loop
from app.api.erp_prod import erp_prod_sync_loop

AUTO_CLOSE_HOUR = 7   # 07:00
SAVE_APELURI_HOUR = 23  # 23:00
GOOGLE_REVIEWS_REFRESH_HOURS = [14, 21]  # 14:00 și 21:00
GOOGLE_REVIEWS_ANALYSIS_HOURS = [12, 21]  # 12:00 și 21:00
SERPAPI_ACCOUNT_FETCH_HOUR = 8  # 08:00


async def auto_close_exercitiu_loop():
    """Background task: auto-close exercitiu at 07:00 and open new one."""
    while True:
        try:
            now = datetime.now()
            # Calculate next 07:00
            target = datetime.combine(now.date(), time(AUTO_CLOSE_HOUR, 0))
            if now >= target:
                target += timedelta(days=1)
            wait_secs = (target - now).total_seconds()
            print(f"Auto-close scheduler: next run at {target} (in {wait_secs:.0f}s)")
            await asyncio.sleep(wait_secs)

            await _do_auto_close()
        except asyncio.CancelledError:
            print("Auto-close scheduler stopped")
            return
        except Exception as e:
            print(f"Auto-close scheduler error: {e}")
            await write_log("ERROR", "sistem", "Auto-close scheduler error", str(e))
            await asyncio.sleep(60)


async def _do_auto_close():
    """Close the active exercitiu and open a new one for today."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Exercitiu)
            .where(Exercitiu.activ == True)
            .order_by(Exercitiu.data.desc())
        )
        exercitiu = result.scalar_one_or_none()

        if not exercitiu:
            print("Auto-close: no active exercitiu, creating one for today")
        elif exercitiu.data >= date.today():
            print(f"Auto-close: exercitiu {exercitiu.data} is current, closing it")
            exercitiu.activ = False
            exercitiu.ora_inchidere = datetime.now()
            exercitiu.observatii = ((exercitiu.observatii or '') + ' [Închis automat 07:00]').strip()
        else:
            print(f"Auto-close: exercitiu {exercitiu.data} is from a past day, closing it")
            exercitiu.activ = False
            exercitiu.ora_inchidere = datetime.now()
            exercitiu.observatii = ((exercitiu.observatii or '') + ' [Închis automat 07:00]').strip()

        # Open new exercitiu for today
        today = date.today()
        existing = await session.execute(
            select(Exercitiu).where(Exercitiu.data == today)
        )
        if existing.scalar_one_or_none() is None:
            new_ex = Exercitiu(data=today, activ=True)
            session.add(new_ex)
            print(f"Auto-close: opened new exercitiu for {today}")
        else:
            print(f"Auto-close: exercitiu for {today} already exists")

        await session.commit()

    # Șterge toți pinii non-permanenți (comenzi de livrare din ziua anterioară)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            delete(MapPin).where(MapPin.permanent.isnot(True))
        )
        deleted = result.rowcount
        await session.commit()
        print(f"Auto-close: șters {deleted} pini non-permanenți de pe hartă")


async def save_apeluri_loop():
    """Background task: save daily call data at 23:00."""
    while True:
        try:
            now = datetime.now()
            target = datetime.combine(now.date(), time(SAVE_APELURI_HOUR, 0))
            if now >= target:
                target += timedelta(days=1)
            wait_secs = (target - now).total_seconds()
            print(f"Apeluri save scheduler: next run at {target} (in {wait_secs:.0f}s)")
            await asyncio.sleep(wait_secs)

            await do_save_apeluri()
        except asyncio.CancelledError:
            print("Apeluri save scheduler stopped")
            return
        except Exception as e:
            print(f"Apeluri save scheduler error: {e}")
            await write_log("ERROR", "sistem", "Save apeluri scheduler error", str(e))
            await asyncio.sleep(60)


async def do_save_apeluri(target_date: date | None = None):
    """Read ami_apeluri for a date and upsert into apeluri_zilnic + apeluri_detalii."""
    target = target_date or date.today()

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(AmiApel)
            .where(AmiApel.data == target)
            .where(AmiApel.status.in_(["COMPLETAT", "ABANDONAT"]))
        )).scalars().all()

    calls = [
        {
            "callid": r.callid,
            "caller_id": r.caller_id or "",
            "agent": r.agent or "",
            "status": r.status,
            "ora": r.ora or "",
            "hold_time": r.hold_time or 0,
            "call_time": r.call_time or 0,
        }
        for r in rows
    ]
    stats = compute_stats(calls)

    if not stats.get("total", 0):
        print(f"Apeluri save: no calls found for {target}, skipping")
        return

    async with AsyncSessionLocal() as session:
        # Check if record exists
        existing = await session.execute(
            select(ApeluriZilnic).where(ApeluriZilnic.data == target)
        )
        zilnic = existing.scalar_one_or_none()

        if zilnic:
            # Update existing
            zilnic.total = stats["total"]
            zilnic.answered = stats["answered"]
            zilnic.abandoned = stats["abandoned"]
            zilnic.answer_rate = stats["answer_rate"]
            zilnic.abandon_rate = stats["abandon_rate"]
            zilnic.asa = stats["asa"]
            zilnic.waited_over_30 = stats["waited_over_30"]
            zilnic.hold_answered_avg = stats["hold_answered"]["avg"]
            zilnic.hold_answered_median = stats["hold_answered"]["median"]
            zilnic.hold_answered_p90 = stats["hold_answered"]["p90"]
            zilnic.hold_abandoned_avg = stats["hold_abandoned"]["avg"]
            zilnic.hold_abandoned_median = stats["hold_abandoned"]["median"]
            zilnic.hold_abandoned_p90 = stats["hold_abandoned"]["p90"]
            zilnic.call_duration_avg = stats["call_duration"]["avg"]
            zilnic.call_duration_median = stats["call_duration"]["median"]
            zilnic.call_duration_p90 = stats["call_duration"]["p90"]
            zilnic.hourly_data = stats["hourly"]
            # Delete old details and re-insert
            await session.execute(
                delete(ApeluriDetalii).where(ApeluriDetalii.apeluri_zilnic_id == zilnic.id)
            )
        else:
            # Create new
            zilnic = ApeluriZilnic(
                data=target,
                total=stats["total"],
                answered=stats["answered"],
                abandoned=stats["abandoned"],
                answer_rate=stats["answer_rate"],
                abandon_rate=stats["abandon_rate"],
                asa=stats["asa"],
                waited_over_30=stats["waited_over_30"],
                hold_answered_avg=stats["hold_answered"]["avg"],
                hold_answered_median=stats["hold_answered"]["median"],
                hold_answered_p90=stats["hold_answered"]["p90"],
                hold_abandoned_avg=stats["hold_abandoned"]["avg"],
                hold_abandoned_median=stats["hold_abandoned"]["median"],
                hold_abandoned_p90=stats["hold_abandoned"]["p90"],
                call_duration_avg=stats["call_duration"]["avg"],
                call_duration_median=stats["call_duration"]["median"],
                call_duration_p90=stats["call_duration"]["p90"],
                hourly_data=stats["hourly"],
            )
            session.add(zilnic)
            await session.flush()  # get zilnic.id

        # Insert call details
        for call in calls:
            det = ApeluriDetalii(
                apeluri_zilnic_id=zilnic.id,
                callid=call.get("callid", ""),
                caller_id=call.get("caller_id", ""),
                agent=call.get("agent", ""),
                status=call.get("status", ""),
                ora=call.get("ora", ""),
                hold_time=call.get("hold_time", 0),
                call_time=call.get("call_time", 0),
            )
            session.add(det)

        await session.commit()
        print(f"Apeluri save: saved {target} — {stats.get('total', 0)} calls")


async def google_reviews_analysis_loop():
    """Background task: auto-run AI analysis at 12:00 and 21:00."""
    while True:
        try:
            now = datetime.now()
            next_run = None
            for hour in sorted(GOOGLE_REVIEWS_ANALYSIS_HOURS):
                candidate = datetime.combine(now.date(), time(hour, 0))
                if candidate > now:
                    next_run = candidate
                    break
            if next_run is None:
                next_run = datetime.combine(
                    now.date() + timedelta(days=1),
                    time(GOOGLE_REVIEWS_ANALYSIS_HOURS[0], 0)
                )
            wait_secs = (next_run - now).total_seconds()
            print(f"Google Reviews Analysis scheduler: next run at {next_run} (in {wait_secs:.0f}s)")
            await asyncio.sleep(wait_secs)

            print("Google Reviews Analysis scheduler: starting...")
            result = await google_reviews_analyze()
            analyzed = result.get("analyzed", 0)
            print(f"Google Reviews Analysis scheduler: done — {analyzed} reviews analyzed")
        except asyncio.CancelledError:
            print("Google Reviews Analysis scheduler stopped")
            return
        except Exception as e:
            print(f"Google Reviews Analysis scheduler error: {e}")
            await write_log("ERROR", "sistem", "Google Reviews analysis scheduler error", str(e))
            await asyncio.sleep(300)


async def serpapi_account_loop():
    """Background task: fetch SerpAPI account info daily at 08:00."""
    while True:
        try:
            now = datetime.now()
            target = datetime.combine(now.date(), time(SERPAPI_ACCOUNT_FETCH_HOUR, 0))
            if now >= target:
                target += timedelta(days=1)
            wait_secs = (target - now).total_seconds()
            print(f"SerpAPI account scheduler: next run at {target} (in {wait_secs:.0f}s)")
            await asyncio.sleep(wait_secs)

            print("SerpAPI account scheduler: fetching account info...")
            result = await do_fetch_serpapi_account()
            print(f"SerpAPI account scheduler: done — {result.get('fetched_at')}")
        except asyncio.CancelledError:
            print("SerpAPI account scheduler stopped")
            return
        except Exception as e:
            print(f"SerpAPI account scheduler error: {e}")
            await write_log("ERROR", "sistem", "SerpAPI account scheduler error", str(e))
            await asyncio.sleep(300)


async def google_reviews_refresh_loop():
    """Background task: auto-refresh Google Reviews at 14:00 and 21:00."""
    while True:
        try:
            now = datetime.now()
            # Find the next scheduled hour
            next_run = None
            for hour in sorted(GOOGLE_REVIEWS_REFRESH_HOURS):
                candidate = datetime.combine(now.date(), time(hour, 0))
                if candidate > now:
                    next_run = candidate
                    break
            if next_run is None:
                # All times today have passed, take first time tomorrow
                next_run = datetime.combine(
                    now.date() + timedelta(days=1),
                    time(GOOGLE_REVIEWS_REFRESH_HOURS[0], 0)
                )
            wait_secs = (next_run - now).total_seconds()
            print(f"Google Reviews scheduler: next run at {next_run} (in {wait_secs:.0f}s)")
            await asyncio.sleep(wait_secs)

            print("Google Reviews scheduler: starting auto-refresh...")
            result = await google_reviews_refresh()
            print(f"Google Reviews scheduler: done — {result}")
        except asyncio.CancelledError:
            print("Google Reviews scheduler stopped")
            return
        except Exception as e:
            print(f"Google Reviews scheduler error: {e}")
            await write_log("ERROR", "sistem", "Google Reviews refresh scheduler error", str(e))
            await asyncio.sleep(300)  # retry in 5 min on error


async def google_reviews_negative_analysis_loop():
    """Background task: auto-run negative reviews analysis on the 1st of each month at 03:00."""
    while True:
        try:
            now = datetime.now()
            # Target: 1st of next month at 03:00
            if now.month == 12:
                next_month_first = datetime(now.year + 1, 1, 1, 3, 0)
            else:
                next_month_first = datetime(now.year, now.month + 1, 1, 3, 0)
            # If today is the 1st and it's before 03:00, run today
            this_month_target = datetime(now.year, now.month, 1, 3, 0)
            next_run = this_month_target if now < this_month_target else next_month_first
            wait_secs = (next_run - now).total_seconds()
            print(f"Negative analysis scheduler: next run at {next_run} (in {wait_secs:.0f}s)")
            await asyncio.sleep(wait_secs)

            print("Negative analysis scheduler: starting...")
            result = await google_reviews_negative_analyze()
            total = result.get("total_negative", 0)
            print(f"Negative analysis scheduler: done — {total} negative reviews analyzed")
        except asyncio.CancelledError:
            print("Negative analysis scheduler stopped")
            return
        except Exception as e:
            print(f"Negative analysis scheduler error: {e}")
            await write_log("ERROR", "sistem", "Negative reviews analysis scheduler error", str(e))
            await asyncio.sleep(3600)


MASTER_CSV = Path("/mnt/asterisk/Master.csv")
MNT_CHECK_INTERVAL = 3600  # check every hour


async def mnt_monitor_loop():
    """Background task: check /mnt/asterisk/Master.csv accessibility every hour."""
    was_ok: bool | None = None  # unknown at start
    while True:
        try:
            is_ok = MASTER_CSV.exists()
            if was_ok is None:
                # First check at startup — always log the state
                if is_ok:
                    await write_log("INFO", "sistem", "Master.csv accesibil", str(MASTER_CSV))
                else:
                    await write_log("WARN", "sistem", "Master.csv nu este accesibil — /mnt/asterisk nemountat?", str(MASTER_CSV))
            elif is_ok and not was_ok:
                await write_log("INFO", "sistem", "Master.csv a redevenit accesibil", str(MASTER_CSV))
            elif not is_ok and was_ok:
                await write_log("WARN", "sistem", "Master.csv nu mai este accesibil — /mnt/asterisk pierdut?", str(MASTER_CSV))
            was_ok = is_ok
        except Exception as e:
            print(f"mnt_monitor error: {e}")
        await asyncio.sleep(MNT_CHECK_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    await init_db()
    task_close = asyncio.create_task(auto_close_exercitiu_loop())
    task_apeluri = asyncio.create_task(save_apeluri_loop())
    task_pontaj = asyncio.create_task(pontaj_fetch_loop())
    task_google_reviews = asyncio.create_task(google_reviews_refresh_loop())
    task_google_analysis = asyncio.create_task(google_reviews_analysis_loop())
    task_google_neg_analysis = asyncio.create_task(google_reviews_negative_analysis_loop())
    task_serpapi_account = asyncio.create_task(serpapi_account_loop())
    task_ami = asyncio.create_task(ami_event_loop())
    task_mnt = asyncio.create_task(mnt_monitor_loop())
    task_competitori = asyncio.create_task(competitor_scrape_loop())
    task_erp_prod = asyncio.create_task(erp_prod_sync_loop())
    yield
    # Shutdown
    for task in [task_close, task_apeluri, task_pontaj, task_google_reviews, task_google_analysis, task_google_neg_analysis, task_serpapi_account, task_ami, task_mnt, task_competitori, task_erp_prod]:
        task.cancel()
    for task in [task_close, task_apeluri, task_pontaj, task_google_reviews, task_google_analysis, task_google_neg_analysis, task_serpapi_account, task_ami, task_mnt, task_competitori, task_erp_prod]:
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
    ## Cheltuieli V2 - Aplicație Management Cheltuieli Restaurant
    
    ### Funcționalități:
    - 🔐 Autentificare cu cod/card
    - 💰 Înregistrare cheltuieli cu autocomplete AI
    - 💼 Gestiune portofele și transferuri
    - 📊 Rapoarte zilnice grupate
    - ⚙️ Setări complete (portofele, categorii, nomenclator, Ollama)
    - 🤖 Chat AI cu BigBoss
    
    ### Roluri:
    - **Operator**: introduce cheltuieli
    - **Șef**: verifică + rapoarte + închide ziua
    - **Admin**: acces complet + setări
    """,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api")


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}

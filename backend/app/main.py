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
from app.models import Exercitiu, ApeluriZilnic, ApeluriDetalii
from app.api import api_router
from app.api.apeluri import parse_queue_log, QUEUE_LOG_DIR

AUTO_CLOSE_HOUR = 7  # 07:00
SAVE_APELURI_HOUR = 23  # 23:00


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
            await asyncio.sleep(60)


async def do_save_apeluri(target_date: date | None = None):
    """Parse queue_log for a date and upsert into apeluri_zilnic + apeluri_detalii."""
    target = target_date or date.today()
    today_str = target.strftime("%Y%m%d")

    # Determine file path
    if target == date.today():
        file_path = QUEUE_LOG_DIR / "queue_log"
        if not file_path.exists():
            file_path = QUEUE_LOG_DIR / f"queue_log-{today_str}"
    else:
        file_path = QUEUE_LOG_DIR / f"queue_log-{today_str}"

    result = parse_queue_log(file_path)
    stats = result.get("stats", {})
    calls = result.get("calls", [])

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
            zilnic.total = stats.get("total", 0)
            zilnic.answered = stats.get("answered", 0)
            zilnic.abandoned = stats.get("abandoned", 0)
            zilnic.answer_rate = stats.get("answer_rate", 0)
            zilnic.abandon_rate = stats.get("abandon_rate", 0)
            zilnic.asa = stats.get("asa", 0)
            zilnic.waited_over_30 = stats.get("waited_over_30", 0)
            zilnic.hold_answered_avg = stats.get("hold_answered", {}).get("avg", 0)
            zilnic.hold_answered_median = stats.get("hold_answered", {}).get("median", 0)
            zilnic.hold_answered_p90 = stats.get("hold_answered", {}).get("p90", 0)
            zilnic.hold_abandoned_avg = stats.get("hold_abandoned", {}).get("avg", 0)
            zilnic.hold_abandoned_median = stats.get("hold_abandoned", {}).get("median", 0)
            zilnic.hold_abandoned_p90 = stats.get("hold_abandoned", {}).get("p90", 0)
            zilnic.call_duration_avg = stats.get("call_duration", {}).get("avg", 0)
            zilnic.call_duration_median = stats.get("call_duration", {}).get("median", 0)
            zilnic.call_duration_p90 = stats.get("call_duration", {}).get("p90", 0)
            zilnic.hourly_data = stats.get("hourly", [])
            # Delete old details and re-insert
            await session.execute(
                delete(ApeluriDetalii).where(ApeluriDetalii.apeluri_zilnic_id == zilnic.id)
            )
        else:
            # Create new
            zilnic = ApeluriZilnic(
                data=target,
                total=stats.get("total", 0),
                answered=stats.get("answered", 0),
                abandoned=stats.get("abandoned", 0),
                answer_rate=stats.get("answer_rate", 0),
                abandon_rate=stats.get("abandon_rate", 0),
                asa=stats.get("asa", 0),
                waited_over_30=stats.get("waited_over_30", 0),
                hold_answered_avg=stats.get("hold_answered", {}).get("avg", 0),
                hold_answered_median=stats.get("hold_answered", {}).get("median", 0),
                hold_answered_p90=stats.get("hold_answered", {}).get("p90", 0),
                hold_abandoned_avg=stats.get("hold_abandoned", {}).get("avg", 0),
                hold_abandoned_median=stats.get("hold_abandoned", {}).get("median", 0),
                hold_abandoned_p90=stats.get("hold_abandoned", {}).get("p90", 0),
                call_duration_avg=stats.get("call_duration", {}).get("avg", 0),
                call_duration_median=stats.get("call_duration", {}).get("median", 0),
                call_duration_p90=stats.get("call_duration", {}).get("p90", 0),
                hourly_data=stats.get("hourly", []),
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    await init_db()
    task_close = asyncio.create_task(auto_close_exercitiu_loop())
    task_apeluri = asyncio.create_task(save_apeluri_loop())
    yield
    # Shutdown
    task_close.cancel()
    task_apeluri.cancel()
    try:
        await task_close
    except asyncio.CancelledError:
        pass
    try:
        await task_apeluri
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

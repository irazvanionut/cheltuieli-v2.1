from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
from datetime import datetime, date, time, timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.database import init_db, AsyncSessionLocal
from app.models import Exercitiu
from app.api import api_router

AUTO_CLOSE_HOUR = 7  # 07:00


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    await init_db()
    task = asyncio.create_task(auto_close_exercitiu_loop())
    yield
    # Shutdown
    task.cancel()
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

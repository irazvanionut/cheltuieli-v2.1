from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import init_db
from app.api import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    await init_db()
    yield
    # Shutdown
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

from fastapi import APIRouter

from app.api import auth, nomenclator, cheltuieli, portofele, rapoarte, settings, apeluri, apeluri_trend, pontaj

api_router = APIRouter()

# Include all sub-routers
api_router.include_router(auth.router)
api_router.include_router(nomenclator.router)
api_router.include_router(cheltuieli.router)
api_router.include_router(portofele.router)
api_router.include_router(rapoarte.router)
api_router.include_router(settings.router)
api_router.include_router(apeluri.router)
api_router.include_router(apeluri_trend.router)
api_router.include_router(pontaj.router)

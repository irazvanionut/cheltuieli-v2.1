from fastapi import APIRouter

from app.api import auth, nomenclator, cheltuieli, portofele, rapoarte, settings, apeluri, apeluri_trend, pontaj, recomandari_apeluri, google_reviews, hass, agenda, lista_apeluri, competitori, erp_prod, navigatie, comenzi, rute, gps_public, orders, predictii

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
api_router.include_router(recomandari_apeluri.router)
api_router.include_router(google_reviews.router)
api_router.include_router(hass.router)
api_router.include_router(agenda.router)
api_router.include_router(lista_apeluri.router)
api_router.include_router(competitori.router)
api_router.include_router(erp_prod.router)
api_router.include_router(navigatie.router)
api_router.include_router(comenzi.router)
api_router.include_router(rute.router)
api_router.include_router(gps_public.router)
api_router.include_router(orders.router)
api_router.include_router(predictii.router)

import math

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

import app.models  # noqa: F401  (enregistre les modèles dans Base.metadata)
from app.api.v1 import (
    audit,
    auth,
    billing,
    chat,
    companies,
    conversations,
    invitations,
    leads,
    members,
    onboarding,
    pricing,
    quote_templates,
    quotes,
    stats,
    widget,
    zones,
)
from app.config import settings
from app.database import engine

# Observabilité pilote : un 500 chez un prospect doit être visible. No-op sans
# DSN ; l'import est gardé pour que l'absence du paquet ne casse jamais l'API.
if settings.sentry_dsn:
    try:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0)
    except ImportError:  # pragma: no cover — sentry-sdk absent de l'environnement
        pass

app = FastAPI(title="Devis AI API", version="0.1.0")

# CORS ouvert : le widget est embarqué sur des sites tiers arbitraires (endpoints
# publics /chat/*) et l'authentification est 100 % Bearer (aucun cookie), donc
# allow_credentials reste à False — un site tiers ne peut pas rejouer une session.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Les erreurs de validation renvoient la valeur reçue (« input ») : si elle
# contient NaN/Infinity (acceptés par json.loads), la sérialisation JSON de la
# réponse 422 échouerait en 500. On remplace les flottants non finis par leur repr.
def _finite(value: object) -> object:
    if isinstance(value, float) and not math.isfinite(value):
        return repr(value)
    if isinstance(value, dict):
        return {k: _finite(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_finite(v) for v in value]
    return value


@app.exception_handler(RequestValidationError)
async def _validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422, content={"detail": _finite(jsonable_encoder(exc.errors()))}
    )


app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(billing.router)
app.include_router(quotes.router)
app.include_router(pricing.router)
app.include_router(zones.router)
app.include_router(onboarding.router)
app.include_router(quote_templates.router)
app.include_router(leads.router)
app.include_router(members.router)
app.include_router(invitations.router)
app.include_router(stats.router)
app.include_router(audit.router)
app.include_router(chat.router)
app.include_router(conversations.router)
app.include_router(widget.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
def health_db() -> dict[str, str]:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"database": "ok"}

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import ActiveMembership, DbSession
from app.llm import client as llm
from app.llm.schemas import ChatPreviewRequest, ChatResponse
from app.models import Company, WidgetSettings
from app.schemas.widget import WidgetSettingsIn, WidgetSettingsOut
from app.services import audit_service
from app.services.permissions import require_admin
from app.services.widget_kb import kb_from_config

router = APIRouter(prefix="/api/v1/widget", tags=["widget"])


def _to_out(settings: WidgetSettings) -> WidgetSettingsOut:
    qas, blocs, prix_m2, tarifs_m2 = kb_from_config(settings.config)
    return WidgetSettingsOut(
        primary_color=settings.primary_color,
        greeting_message=settings.greeting_message,
        avatar_url=settings.avatar_url,
        qas=qas,
        blocs=blocs,
        prix_m2=prix_m2,
        tarifs_m2=tarifs_m2,
    )


# Configuration actuelle du chatbot de l'entreprise (édition dans le dashboard).
@router.get("/settings", response_model=WidgetSettingsOut)
def get_settings(db: DbSession, membership: ActiveMembership) -> WidgetSettingsOut:
    settings = db.scalar(
        select(WidgetSettings).where(WidgetSettings.company_id == membership.company_id)
    )
    if settings is None:
        return WidgetSettingsOut()
    return _to_out(settings)


# Publie la configuration : apparence + base de connaissances (upsert).
@router.put("/settings", response_model=WidgetSettingsOut)
def put_settings(
    payload: WidgetSettingsIn, db: DbSession, membership: ActiveMembership
) -> WidgetSettingsOut:
    require_admin(membership)
    settings = db.scalar(
        select(WidgetSettings).where(WidgetSettings.company_id == membership.company_id)
    )
    if settings is None:
        settings = WidgetSettings(company_id=membership.company_id)
        db.add(settings)

    settings.primary_color = payload.primary_color
    settings.greeting_message = payload.greeting_message
    settings.avatar_url = payload.avatar_url
    settings.config = {
        "qas": [q.model_dump() for q in payload.qas],
        "blocs": [b.model_dump() for b in payload.blocs],
        "prix_m2": payload.prix_m2,
        "tarifs_m2": [t.model_dump() for t in payload.tarifs_m2 if t.categorie.strip() and t.prix.strip()],
    }
    audit_service.record(
        db, company_id=membership.company_id, type_="ai",
        action="a publié l'assistant",
        target=f"{len(payload.qas)} Q&R · {len(payload.blocs)} message(s)",
        actor_user_id=membership.user_id,
    )
    db.commit()
    db.refresh(settings)
    return _to_out(settings)


# Aperçu du dashboard : teste une base de connaissances non sauvegardée.
# Authentifié — contrairement à /chat/message (public), la BDC vient du corps.
@router.post("/preview/message", response_model=ChatResponse)
def preview_message(
    payload: ChatPreviewRequest, db: DbSession, membership: ActiveMembership
) -> ChatResponse:
    company = db.get(Company, membership.company_id)
    try:
        return llm.generate_reply(
            message=payload.message,
            company_name=company.name if company else "votre entreprise",
            qas=payload.qas,
            blocs=payload.blocs,
            history=payload.history,
            prix_m2=payload.prix_m2,
            tarifs_m2=payload.tarifs_m2,
        )
    except llm.LLMUnavailable as exc:
        # 503 → l'aperçu bascule sur le matching local.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

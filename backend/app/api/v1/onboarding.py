from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import ActiveMembership, DbSession
from app.api.v1.widget import kb_from_config
from app.models import Company, PriceItem, Quote, ServiceZone, WidgetSettings

router = APIRouter(prefix="/api/v1/onboarding", tags=["onboarding"])


class OnboardingOut(BaseModel):
    hasMetier: bool
    hasCatalog: bool
    hasZones: bool
    hasAssistant: bool  # base de connaissances publiée
    hasQuote: bool
    complete: bool


# Étapes d'activation du compte : tout à vrai = l'entreprise peut recevoir des
# devis chiffrés depuis le chat. Alimente la checklist du tableau de bord.
@router.get("", response_model=OnboardingOut)
def onboarding_status(db: DbSession, membership: ActiveMembership) -> OnboardingOut:
    company_id = membership.company_id
    company = db.get(Company, company_id)

    def count(model) -> int:
        stmt = select(func.count()).select_from(model).where(model.company_id == company_id)
        if hasattr(model, "is_active"):
            stmt = stmt.where(model.is_active.is_(True))
        return db.scalar(stmt) or 0

    settings = db.scalar(select(WidgetSettings).where(WidgetSettings.company_id == company_id))
    qas, blocs, prix_m2 = kb_from_config(settings.config if settings else None)

    has_metier = bool(company and company.metier)
    has_catalog = count(PriceItem) > 0
    has_zones = count(ServiceZone) > 0
    has_assistant = bool(qas or blocs or prix_m2)
    has_quote = count(Quote) > 0

    return OnboardingOut(
        hasMetier=has_metier,
        hasCatalog=has_catalog,
        hasZones=has_zones,
        hasAssistant=has_assistant,
        hasQuote=has_quote,
        complete=all([has_metier, has_catalog, has_zones, has_assistant]),
    )

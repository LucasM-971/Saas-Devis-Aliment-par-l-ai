from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.deps import ActiveMembership, DbSession
from app.models import Company
from app.models.company import PLANS
from app.services import audit_service
from app.services.features import monthly_quote_limit, plan_features
from app.services.quota import quote_quota

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


class QuoteQuotaOut(BaseModel):
    used: int
    limit: int | None  # null = illimité


class PlanOut(BaseModel):
    plan: str
    features: dict[str, bool]
    quoteQuota: QuoteQuotaOut


class PlanChangeIn(BaseModel):
    plan: str


class PublicPlanOut(BaseModel):
    id: str
    name: str
    tagline: str
    features: list[str]  # libellés affichables (dérivés des drapeaux réels)
    quoteLimit: int | None  # devis / mois ; null = illimité
    featured: bool


# Habillage marketing des plans ; les capacités viennent de features.py.
_PLAN_MARKETING: dict[str, dict] = {
    "free": {"name": "Gratuit", "tagline": "Pour démarrer", "featured": False},
    "premium": {
        "name": "Premium",
        "tagline": "Toutes les fonctionnalités",
        "featured": True,
    },
}


def _plan_feature_labels(plan: str) -> list[str]:
    flags = plan_features(plan)
    limit = monthly_quote_limit(plan)
    labels = [
        "Devis illimités" if limit is None else f"Jusqu'à {limit} devis / mois",
        "Assistant IA : widget + lien de chat hébergé",
        "Grille tarifaire et zones d'intervention",
        "Équipe, rôles et journal d'audit",
    ]
    if flags.get("quote_customization"):
        labels.append("Personnalisation du modèle de devis")
    if flags.get("multi_company"):
        labels.append("Plusieurs espaces entreprise")
    return labels


# Catalogue public des offres (section Tarifs de la landing). Sans
# authentification : reflète exactement les gates servies par l'API.
@router.get("/plans", response_model=list[PublicPlanOut])
def list_plans() -> list[PublicPlanOut]:
    return [
        PublicPlanOut(
            id=plan,
            features=_plan_feature_labels(plan),
            quoteLimit=monthly_quote_limit(plan),
            **_PLAN_MARKETING[plan],
        )
        for plan in PLANS
    ]


def _plan_out(db: DbSession, company: Company) -> PlanOut:
    quota = quote_quota(db, company.id, company.plan)
    return PlanOut(
        plan=company.plan,
        features=plan_features(company.plan),
        quoteQuota=QuoteQuotaOut(used=quota.used, limit=quota.limit),
    )


# Plan courant + drapeaux de fonctionnalités + quota de devis du mois.
@router.get("/plan", response_model=PlanOut)
def get_plan(db: DbSession, membership: ActiveMembership) -> PlanOut:
    company = db.get(Company, membership.company_id)
    if company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entreprise introuvable")
    return _plan_out(db, company)


# Changement de plan simulé (Stripe gelé — cf. ROADMAP). Réservé au propriétaire.
@router.post("/plan", response_model=PlanOut)
def change_plan(payload: PlanChangeIn, db: DbSession, membership: ActiveMembership) -> PlanOut:
    if membership.role != "owner":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Seul le propriétaire peut changer d'abonnement"
        )
    if payload.plan not in PLANS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Plan inconnu")
    company = db.get(Company, membership.company_id)
    if company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entreprise introuvable")
    company.plan = payload.plan
    audit_service.record(
        db, company_id=company.id, type_="pricing",
        action="a changé l'abonnement",
        target="Premium" if payload.plan == "premium" else "Gratuit",
        actor_user_id=membership.user_id,
    )
    db.commit()
    db.refresh(company)
    return _plan_out(db, company)

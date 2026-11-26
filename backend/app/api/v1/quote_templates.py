import json
from fastapi import APIRouter, HTTPException, status

from app.api.deps import ActiveMembership, DbSession
from app.models import Company, QuoteTemplate
from app.schemas.quote_template import QuoteTemplateIn, QuoteTemplateOut
from app.services.features import has_feature
from app.services.permissions import require_admin
from sqlalchemy import select

router = APIRouter(prefix="/api/v1/quote-templates", tags=["quote-templates"])

DEFAULTS = QuoteTemplateIn()


def _serialize(t: QuoteTemplate | None) -> QuoteTemplateOut:
    if t is None:
        return QuoteTemplateOut(
            accentColor=DEFAULTS.accentColor,
            logoDataUrl=None,
            logoPosition=DEFAULTS.logoPosition,
            showReference=DEFAULTS.showReference,
            showDate=DEFAULTS.showDate,
            showClientEmail=DEFAULTS.showClientEmail,
            showCompanyDetails=DEFAULTS.showCompanyDetails,
            showLegal=DEFAULTS.showLegal,
            footerText=DEFAULTS.footerText,
            backgroundImageUrl=None,
        )
    cfg: dict = json.loads(t.config) if t.config else {}
    return QuoteTemplateOut(
        accentColor=cfg.get("accentColor", DEFAULTS.accentColor),
        logoDataUrl=cfg.get("logoDataUrl"),
        logoPosition=cfg.get("logoPosition", DEFAULTS.logoPosition),
        showReference=cfg.get("showReference", DEFAULTS.showReference),
        showDate=cfg.get("showDate", DEFAULTS.showDate),
        showClientEmail=cfg.get("showClientEmail", DEFAULTS.showClientEmail),
        showCompanyDetails=cfg.get("showCompanyDetails", DEFAULTS.showCompanyDetails),
        showLegal=cfg.get("showLegal", DEFAULTS.showLegal),
        footerText=cfg.get("footerText", DEFAULTS.footerText),
        backgroundImageUrl=cfg.get("backgroundImageUrl"),
        canvasLayout=cfg.get("canvasLayout"),
    )


@router.get("", response_model=QuoteTemplateOut)
def get_template(db: DbSession, membership: ActiveMembership) -> QuoteTemplateOut:
    t = db.scalars(
        select(QuoteTemplate).where(QuoteTemplate.company_id == membership.company_id)
    ).first()
    return _serialize(t)


@router.patch("", response_model=QuoteTemplateOut)
def upsert_template(
    payload: QuoteTemplateIn, db: DbSession, membership: ActiveMembership
) -> QuoteTemplateOut:
    require_admin(membership)
    # Personnalisation du modèle réservée au premium
    company = db.get(Company, membership.company_id)
    if company is None or not has_feature(company.plan, "quote_customization"):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Fonctionnalité premium : passez au plan Premium pour personnaliser vos devis.",
        )
    t = db.scalars(
        select(QuoteTemplate).where(QuoteTemplate.company_id == membership.company_id)
    ).first()
    cfg = payload.model_dump()
    if t is None:
        t = QuoteTemplate(
            company_id=membership.company_id, name="default", config=json.dumps(cfg)
        )
        db.add(t)
    else:
        t.config = json.dumps(cfg)
    db.commit()
    db.refresh(t)
    return _serialize(t)

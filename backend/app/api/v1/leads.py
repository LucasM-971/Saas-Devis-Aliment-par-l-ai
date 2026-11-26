from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import ActiveMembership, DbSession
from app.models import Company, Lead, Quote
from app.schemas.lead import LeadOut
from app.services import audit_service
from app.services.permissions import require_writer
from app.services.quota import quote_quota
from app.services.references import next_quote_reference

router = APIRouter(prefix="/api/v1/leads", tags=["leads"])


def _serialize(lead: Lead) -> LeadOut:
    return LeadOut(
        id=str(lead.id),
        name=" ".join(p for p in [lead.first_name, lead.last_name] if p) or (lead.email or "Prospect"),
        email=lead.email,
        phone=lead.phone,
        source="Widget — site web",
        createdAt=lead.created_at.date().isoformat(),
        conversationId=str(lead.conversation_id) if lead.conversation_id else None,
        quoteId=str(lead.quote_id) if lead.quote_id else None,
    )


@router.get("", response_model=list[LeadOut])
def list_leads(db: DbSession, membership: ActiveMembership) -> list[LeadOut]:
    leads = db.scalars(
        select(Lead).where(Lead.company_id == membership.company_id).order_by(Lead.created_at.desc())
    ).all()
    return [_serialize(lead) for lead in leads]


# Convertit un prospect en devis brouillon vide (même quota que POST /quotes).
@router.post("/{lead_id}/convert", response_model=LeadOut)
def convert_lead(lead_id: int, db: DbSession, membership: ActiveMembership) -> LeadOut:
    require_writer(membership)
    lead = db.get(Lead, lead_id)
    if lead is None or lead.company_id != membership.company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prospect introuvable")
    if lead.quote_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Prospect déjà converti")

    company = db.get(Company, membership.company_id)
    quota = quote_quota(db, membership.company_id, company.plan if company else "free")
    if quota.exhausted:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Quota atteint ({quota.limit} devis/mois en plan gratuit). "
            "Passez au plan Premium pour créer des devis en illimité.",
        )

    quote = Quote(
        company_id=membership.company_id,
        conversation_id=lead.conversation_id,
        reference=next_quote_reference(db, membership.company_id),
        customer_first_name=lead.first_name,
        customer_last_name=lead.last_name,
        customer_email=lead.email,
        customer_phone=lead.phone,
        status="draft",
        created_by=membership.user_id,
    )
    db.add(quote)
    db.flush()
    lead.quote_id = quote.id
    lead.status = "converted"
    audit_service.record(
        db, company_id=membership.company_id, type_="lead",
        action="a converti le prospect en devis", target=quote.reference,
        actor_user_id=membership.user_id,
    )
    db.commit()
    db.refresh(lead)
    return _serialize(lead)

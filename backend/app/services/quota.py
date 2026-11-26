"""Quota mensuel de devis (gate premium `unlimited_quotes`)."""

from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Quote
from app.services.features import QuoteQuota, monthly_quote_limit


# Devis créés par l'entreprise depuis le début du mois calendaire courant.
def quotes_created_this_month(db: Session, company_id: int) -> int:
    month_start = datetime.combine(date.today().replace(day=1), datetime.min.time())
    return (
        db.scalar(
            select(func.count())
            .select_from(Quote)
            .where(Quote.company_id == company_id, Quote.created_at >= month_start)
        )
        or 0
    )


def quote_quota(db: Session, company_id: int, plan: str) -> QuoteQuota:
    limit = monthly_quote_limit(plan)
    used = quotes_created_this_month(db, company_id)
    return QuoteQuota(used=used, limit=limit)

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import ActiveMembership, DbSession
from app.models import Company, Lead, Quote
from app.schemas.stats import PlatformStatsOut, StatsOut
from app.services.stats_service import compute_stats

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get("", response_model=StatsOut)
def get_stats(db: DbSession, membership: ActiveMembership) -> StatsOut:
    quotes = db.scalars(select(Quote).where(Quote.company_id == membership.company_id)).all()
    stats = compute_stats([(q.status, float(q.total)) for q in quotes])
    return StatsOut(**stats.__dict__)


# Totaux publics pour la landing (aucune donnée nominative).
@router.get("/platform", response_model=PlatformStatsOut)
def get_platform_stats(db: DbSession) -> PlatformStatsOut:
    def total(model: type) -> int:
        return db.scalar(select(func.count()).select_from(model)) or 0

    return PlatformStatsOut(
        quotesGenerated=total(Quote),
        companiesRegistered=total(Company),
        leadsCaptured=total(Lead),
    )

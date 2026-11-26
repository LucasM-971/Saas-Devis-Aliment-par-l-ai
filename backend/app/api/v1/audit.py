from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import ActiveMembership, DbSession
from app.models import AuditLog
from app.schemas.audit import AuditOut

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])

# Le journal grossit indéfiniment : la lecture est paginée.
DEFAULT_LIMIT = 100
MAX_LIMIT = 200


# Les libellés d'affichage (type/actor/action/target) sont stockés dans meta.
@router.get("", response_model=list[AuditOut])
def list_audit(
    db: DbSession,
    membership: ActiveMembership,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[AuditOut]:
    logs = db.scalars(
        select(AuditLog)
        .where(AuditLog.company_id == membership.company_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    result = []
    for log in logs:
        meta = log.meta or {}
        result.append(
            AuditOut(
                id=str(log.id),
                type=meta.get("type", "quote"),
                actor=meta.get("actor", "Système"),
                action=meta.get("action", log.action),
                target=meta.get("target", ""),
                createdAt=log.created_at.date().isoformat(),
            )
        )
    return result

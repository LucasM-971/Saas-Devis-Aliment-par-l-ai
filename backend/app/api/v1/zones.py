import re

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import ActiveMembership, DbSession
from app.models import ServiceZone
from app.services import audit_service
from app.services.permissions import require_admin

router = APIRouter(prefix="/api/v1/zones", tags=["zones"])

# Code postal français : 5 chiffres.
_POSTAL_RE = re.compile(r"^\d{5}$")


class ZoneOut(BaseModel):
    id: str
    postalCode: str
    label: str


class ZoneIn(BaseModel):
    postalCode: str = Field(max_length=10)
    # Colonne String(100) : au-delà, l'INSERT échouerait en DataError (500).
    label: str | None = Field(default=None, max_length=100)


def _serialize(zones: list[ServiceZone]) -> list[ZoneOut]:
    return [
        ZoneOut(id=str(z.id), postalCode=z.postal_code or "", label=z.label)
        for z in zones
    ]


# Zone d'intervention de l'entreprise : filtre d'éligibilité du chat.
@router.get("", response_model=list[ZoneOut])
def list_zones(db: DbSession, membership: ActiveMembership) -> list[ZoneOut]:
    zones = db.scalars(
        select(ServiceZone)
        .where(ServiceZone.company_id == membership.company_id, ServiceZone.is_active.is_(True))
        .order_by(ServiceZone.postal_code)
    ).all()
    return _serialize(zones)


# Remplace la zone d'intervention (codes postaux dédupliqués, anciens désactivés).
@router.put("", response_model=list[ZoneOut])
def replace_zones(
    payload: list[ZoneIn], db: DbSession, membership: ActiveMembership
) -> list[ZoneOut]:
    require_admin(membership)
    company_id = membership.company_id

    seen: set[str] = set()
    cleaned: list[tuple[str, str]] = []
    for entry in payload:
        code = entry.postalCode.strip()
        if not code:
            continue
        if not _POSTAL_RE.match(code):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"Code postal invalide : « {code} » (5 chiffres attendus)",
            )
        if code in seen:
            continue
        seen.add(code)
        cleaned.append((code, (entry.label or "").strip() or code))

    existing = db.scalars(
        select(ServiceZone).where(
            ServiceZone.company_id == company_id, ServiceZone.is_active.is_(True)
        )
    ).all()
    for zone in existing:
        zone.is_active = False

    created = [
        ServiceZone(company_id=company_id, postal_code=code, label=label)
        for code, label in cleaned
    ]
    db.add_all(created)
    audit_service.record(
        db, company_id=company_id, type_="pricing",
        action="a mis à jour la zone d'intervention",
        target=f"{len(created)} code{'s' if len(created) != 1 else ''} postal{'aux' if len(created) != 1 else ''}",
        actor_user_id=membership.user_id,
    )
    db.commit()
    for zone in created:
        db.refresh(zone)
    return _serialize(sorted(created, key=lambda z: z.postal_code or ""))

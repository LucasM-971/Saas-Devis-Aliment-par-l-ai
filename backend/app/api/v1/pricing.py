from decimal import Decimal

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import ActiveMembership, DbSession
from app.models import PriceItem, Service
from app.schemas.pricing import PriceItemIn, PriceItemOut
from app.services import audit_service
from app.services.permissions import require_admin

router = APIRouter(prefix="/api/v1/pricing", tags=["pricing"])


def _serialize(items: list[PriceItem]) -> list[PriceItemOut]:
    return [
        PriceItemOut(id=str(i.id), label=i.label, unit=i.unit, unitPrice=float(i.unit_price))
        for i in items
    ]


# Grille tarifaire de l'entreprise : postes proposés à la création d'un devis.
@router.get("/items", response_model=list[PriceItemOut])
def list_price_items(db: DbSession, membership: ActiveMembership) -> list[PriceItemOut]:
    items = db.scalars(
        select(PriceItem)
        .where(PriceItem.company_id == membership.company_id, PriceItem.is_active.is_(True))
        .order_by(PriceItem.label)
    ).all()
    return _serialize(items)


# Remplace la grille tarifaire (page Réglages › Catalogue). Les anciens postes sont
# désactivés (pas supprimés) : les lignes de devis existantes gardent leur référence.
@router.put("/items", response_model=list[PriceItemOut])
def replace_price_items(
    payload: list[PriceItemIn], db: DbSession, membership: ActiveMembership
) -> list[PriceItemOut]:
    require_admin(membership)
    company_id = membership.company_id

    existing = db.scalars(
        select(PriceItem).where(PriceItem.company_id == company_id, PriceItem.is_active.is_(True))
    ).all()
    for item in existing:
        item.is_active = False

    # Les nouveaux postes sont rattachés au service du métier de l'entreprise
    # (wedge « 1 métier ») s'il existe, pour rester chiffrables par le chat.
    service_id = db.scalar(
        select(Service.id)
        .where(Service.company_id == company_id, Service.is_active.is_(True))
        .order_by(Service.id)
        .limit(1)
    )

    created: list[PriceItem] = []
    for entry in payload:
        label = entry.label.strip()
        if not label or entry.unitPrice < 0:
            continue
        item = PriceItem(
            company_id=company_id,
            service_id=service_id,
            label=label,
            unit=entry.unit,
            unit_price=Decimal(str(entry.unitPrice)),
        )
        db.add(item)
        created.append(item)

    audit_service.record(
        db, company_id=company_id, type_="pricing",
        action="a mis à jour la grille tarifaire",
        target=f"{len(created)} poste{'s' if len(created) != 1 else ''}",
        actor_user_id=membership.user_id,
    )
    db.commit()
    for item in created:
        db.refresh(item)
    return _serialize(sorted(created, key=lambda i: i.label))

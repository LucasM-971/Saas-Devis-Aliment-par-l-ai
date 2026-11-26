"""Configuration du métier unique d'une entreprise."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PriceItem, Service

# Métiers proposés par le produit (alignés sur dashboard/src/lib/trades.ts).
METIERS: dict[str, str] = {
    "reno": "Rénovation énergétique",
    "plomberie": "Plomberie / chauffage",
    "electricite": "Électricité",
    "menuiserie": "Menuiserie / fenêtres",
    "peinture": "Peinture / revêtements",
    "serrurerie": "Serrurerie / dépannage",
}


def is_known_metier(metier: str | None) -> bool:
    return metier in METIERS


# Active le service du métier, désactive les autres et y rattache la grille.
def sync_service_with_metier(db: Session, company_id: int, metier: str) -> Service:
    services = db.scalars(select(Service).where(Service.company_id == company_id)).all()

    current = next((s for s in services if s.slug == metier), None)
    if current is None:
        current = Service(company_id=company_id, name=METIERS[metier], slug=metier)
        db.add(current)
        db.flush()
    else:
        current.name = METIERS[metier]
        current.is_active = True

    for service in services:
        if service.id != current.id:
            service.is_active = False

    items = db.scalars(
        select(PriceItem).where(PriceItem.company_id == company_id, PriceItem.is_active.is_(True))
    ).all()
    for item in items:
        item.service_id = current.id

    return current

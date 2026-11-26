from decimal import Decimal

from sqlalchemy import Enum, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import UNITS, CreatedMixin, IdMixin, TimestampMixin, fk_column


# Type de prestation (pivot entre questions et grille de prix).
class Service(IdMixin, CreatedMixin, Base):
    __tablename__ = "services"
    __table_args__ = (UniqueConstraint("company_id", "slug", name="uq_services_slug"),)

    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    name: Mapped[str] = mapped_column(String(150))
    slug: Mapped[str] = mapped_column(String(150))
    is_active: Mapped[bool] = mapped_column(default=True)


# Zone desservie = filtre d'éligibilité.
class ServiceZone(IdMixin, CreatedMixin, Base):
    __tablename__ = "service_zones"

    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    label: Mapped[str] = mapped_column(String(100))
    postal_code: Mapped[str | None] = mapped_column(String(10))
    is_active: Mapped[bool] = mapped_column(default=True)


# Cœur du produit : prix unitaire par poste.
class PriceItem(IdMixin, TimestampMixin, Base):
    __tablename__ = "price_items"

    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    service_id: Mapped[int | None] = fk_column("services.id", nullable=True, ondelete="SET NULL")
    label: Mapped[str] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(Enum(*UNITS), default="unit")
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    is_active: Mapped[bool] = mapped_column(default=True)

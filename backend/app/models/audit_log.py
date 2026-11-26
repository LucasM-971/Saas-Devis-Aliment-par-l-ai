from typing import Any

from sqlalchemy import JSON, String
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedMixin, IdMixin, fk_column


# Journal d'audit multi-tenant (company_id NULL = action système).
class AuditLog(IdMixin, CreatedMixin, Base):
    __tablename__ = "audit_logs"

    company_id: Mapped[int | None] = fk_column("companies.id", nullable=True, ondelete="CASCADE")
    actor_user_id: Mapped[int | None] = fk_column("users.id", nullable=True, ondelete="SET NULL")
    action: Mapped[str] = mapped_column(String(80))
    entity_type: Mapped[str | None] = mapped_column(String(60))
    entity_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True))
    # "metadata" est réservé par SQLAlchemy → attribut Python "meta".
    meta: Mapped[Any | None] = mapped_column("metadata", JSON)
    ip_address: Mapped[str | None] = mapped_column(String(45))

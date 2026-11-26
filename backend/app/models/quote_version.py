from typing import Any

from sqlalchemy import JSON, Enum, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedMixin, IdMixin, fk_column


# Historique : version brute IA + chaque correction humaine.
class QuoteVersion(IdMixin, CreatedMixin, Base):
    __tablename__ = "quote_versions"
    __table_args__ = (UniqueConstraint("quote_id", "version_number", name="uq_quote_version"),)

    quote_id: Mapped[int] = fk_column("quotes.id", nullable=False, ondelete="CASCADE")
    version_number: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(Enum("ai", "human"))
    data: Mapped[Any] = mapped_column(JSON)
    note: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[int | None] = fk_column("users.id", nullable=True, ondelete="SET NULL")

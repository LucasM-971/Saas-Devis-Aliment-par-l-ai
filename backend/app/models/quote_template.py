from typing import Any

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import IdMixin, TimestampMixin, fk_column


# Modèle de design du devis PDF.
class QuoteTemplate(IdMixin, TimestampMixin, Base):
    __tablename__ = "quote_templates"

    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    name: Mapped[str] = mapped_column(String(100), default="default")
    config: Mapped[Any | None] = mapped_column(JSON)
    is_default: Mapped[bool] = mapped_column(default=False)

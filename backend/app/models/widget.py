from typing import Any

from sqlalchemy import JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import IdMixin, TimestampMixin, fk_column


# Apparence du widget chatbot (1 ligne par entreprise).
class WidgetSettings(IdMixin, TimestampMixin, Base):
    __tablename__ = "widget_settings"
    __table_args__ = (UniqueConstraint("company_id", name="uq_widget_company"),)

    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    primary_color: Mapped[str] = mapped_column(String(9), default="#2563EB")
    greeting_message: Mapped[str | None] = mapped_column(String(500))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    config: Mapped[Any | None] = mapped_column(JSON)

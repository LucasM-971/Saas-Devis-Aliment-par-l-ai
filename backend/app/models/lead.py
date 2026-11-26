from sqlalchemy import Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedMixin, IdMixin, fk_column

LEAD_REASONS = ("out_of_zone", "unsupported_service", "incomplete", "quota_exceeded", "other")
LEAD_STATUSES = ("new", "contacted", "converted", "closed")


# Demandes hors-zone / non chiffrables : contact à rappeler.
class Lead(IdMixin, CreatedMixin, Base):
    __tablename__ = "leads"

    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    conversation_id: Mapped[int | None] = fk_column(
        "conversations.id", nullable=True, ondelete="SET NULL"
    )
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(30))
    request_text: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Enum(*LEAD_REASONS), default="other")
    status: Mapped[str] = mapped_column(Enum(*LEAD_STATUSES), default="new")
    # Devis créé lors de la conversion du prospect (bouton « Créer un devis »).
    quote_id: Mapped[int | None] = fk_column("quotes.id", nullable=True, ondelete="SET NULL")

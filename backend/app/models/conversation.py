from datetime import datetime
from typing import Any

from sqlalchemy import CHAR, JSON, Enum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedMixin, IdMixin, fk_column


# Statuts : open → completed. « abandonnée » (inactif > 24 h) est calculée, jamais stockée.
class Conversation(IdMixin, CreatedMixin, Base):
    __tablename__ = "conversations"
    # Unique par entreprise, pas globalement
    __table_args__ = (
        UniqueConstraint("company_id", "session_uid", name="uq_conversations_company_session"),
    )

    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    session_uid: Mapped[str] = mapped_column(CHAR(36))
    status: Mapped[str] = mapped_column(Enum("open", "completed", "abandoned"), default="open")
    # [{role, content, ts}] ; ts peut manquer sur les anciennes lignes
    transcript: Mapped[Any | None] = mapped_column(JSON)
    extracted_data: Mapped[Any | None] = mapped_column(JSON)
    # Position dans l'arbre de qualification
    flow_state: Mapped[Any | None] = mapped_column(JSON)
    completed_at: Mapped[datetime | None]
    # Horodatage du dernier tour : sert à dériver les conversations abandonnées.
    last_activity_at: Mapped[datetime | None]

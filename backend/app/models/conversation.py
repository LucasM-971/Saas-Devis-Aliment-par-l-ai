from datetime import datetime
from typing import Any

from sqlalchemy import CHAR, JSON, Enum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedMixin, IdMixin, fk_column


# Cycle de vie d'une conversation de qualification :
#
#   POST /chat/message (1er tour)          POST /chat/quote (ou fin d'arbre)
#        │                                       │
#        ▼                                       ▼
#   ┌────────┐  tours suivants (append)    ┌───────────┐
#   │  open  │ ───────────────────────────>│ completed │  (completed_at posé)
#   └────────┘                             └───────────┘
#        │
#        │ inactif > 24 h (last_activity_at)
#        ▼
#   « abandonnée » — DÉRIVÉ à la lecture (stats), jamais écrit :
#   la valeur d'enum "abandoned" n'est posée que manuellement.
class Conversation(IdMixin, CreatedMixin, Base):
    __tablename__ = "conversations"
    # session_uid est fourni par le navigateur du prospect : le même uid peut
    # légitimement apparaître chez deux entreprises (même visiteur, deux artisans).
    # L'unicité est donc par entreprise, jamais globale.
    __table_args__ = (
        UniqueConstraint("company_id", "session_uid", name="uq_conversations_company_session"),
    )

    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    session_uid: Mapped[str] = mapped_column(CHAR(36))
    status: Mapped[str] = mapped_column(Enum("open", "completed", "abandoned"), default="open")
    # Liste de tours [{role, content, ts}] — ts absent sur les lignes antérieures
    # à l'instrumentation pilote : les lecteurs doivent le tolérer.
    transcript: Mapped[Any | None] = mapped_column(JSON)
    extracted_data: Mapped[Any | None] = mapped_column(JSON)
    # Position dans l'arbre de qualification (rempli par conversation_flow, lot B).
    flow_state: Mapped[Any | None] = mapped_column(JSON)
    completed_at: Mapped[datetime | None]
    # Horodatage du dernier tour : sert à dériver les conversations abandonnées.
    last_activity_at: Mapped[datetime | None]

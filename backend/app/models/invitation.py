from datetime import datetime

from sqlalchemy import CHAR, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedMixin, IdMixin, fk_column


class Invitation(IdMixin, CreatedMixin, Base):
    __tablename__ = "invitations"

    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    email: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(Enum("owner", "admin", "member", "viewer"), default="member")
    token_hash: Mapped[str] = mapped_column(CHAR(64), unique=True)
    status: Mapped[str] = mapped_column(
        Enum("pending", "accepted", "revoked", "expired"), default="pending"
    )
    invited_by: Mapped[int | None] = fk_column("users.id", nullable=True, ondelete="SET NULL")
    expires_at: Mapped[datetime]
    accepted_at: Mapped[datetime | None]

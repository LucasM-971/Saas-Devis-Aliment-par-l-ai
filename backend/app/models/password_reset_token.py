from datetime import datetime

from sqlalchemy import CHAR
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedMixin, IdMixin, fk_column


class PasswordResetToken(IdMixin, CreatedMixin, Base):
    __tablename__ = "password_reset_tokens"

    user_id: Mapped[int] = fk_column("users.id", nullable=False, ondelete="CASCADE")
    token_hash: Mapped[str] = mapped_column(CHAR(64), unique=True)
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]


class EmailVerificationToken(IdMixin, CreatedMixin, Base):
    __tablename__ = "email_verification_tokens"

    user_id: Mapped[int] = fk_column("users.id", nullable=False, ondelete="CASCADE")
    token_hash: Mapped[str] = mapped_column(CHAR(64), unique=True)
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]

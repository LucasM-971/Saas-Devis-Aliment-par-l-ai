from datetime import datetime

from sqlalchemy import CHAR, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedMixin, IdMixin, fk_column


class ApiKey(IdMixin, CreatedMixin, Base):
    __tablename__ = "api_keys"

    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    name: Mapped[str] = mapped_column(String(100), default="default")
    key_prefix: Mapped[str] = mapped_column(String(16))
    key_hash: Mapped[str] = mapped_column(CHAR(64), unique=True)
    last_used_at: Mapped[datetime | None]
    revoked_at: Mapped[datetime | None]

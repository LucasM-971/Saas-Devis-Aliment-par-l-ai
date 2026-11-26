from datetime import datetime
from typing import Any

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import IdMixin, TimestampMixin


# Pas de company_id : la relation user↔entreprise passe par memberships.
class User(IdMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    email_verified_at: Mapped[datetime | None]
    # Préférences d'e-mails de notification (null = valeurs par défaut).
    notification_prefs: Mapped[Any | None] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(default=True)

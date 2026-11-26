from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import Mapped, mapped_column

# Briques communes à tous les modèles (conventions du schéma MySQL).

# Valeurs d'énumérations partagées entre plusieurs tables.
ROLES = ("owner", "admin", "member", "viewer")
UNITS = ("m2", "ml", "m3", "unit", "hour", "flat", "-")


class IdMixin:
    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)


class CreatedMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class TimestampMixin(CreatedMixin):
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


# Colonne de clé étrangère BIGINT UNSIGNED (fabrique une nouvelle colonne à chaque appel).
def fk_column(target: str, *, nullable: bool, ondelete: str) -> Mapped[int]:
    return mapped_column(BIGINT(unsigned=True), ForeignKey(target, ondelete=ondelete), nullable=nullable)

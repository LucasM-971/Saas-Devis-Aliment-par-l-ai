from sqlalchemy import Enum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedMixin, IdMixin, fk_column


class Membership(IdMixin, CreatedMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "company_id", name="uq_membership"),)

    user_id: Mapped[int] = fk_column("users.id", nullable=False, ondelete="CASCADE")
    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    role: Mapped[str] = mapped_column(Enum("owner", "admin", "member", "viewer"), default="member")
    status: Mapped[str] = mapped_column(Enum("active", "suspended"), default="active")

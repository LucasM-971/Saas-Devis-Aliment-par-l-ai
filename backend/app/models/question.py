from typing import Any

from sqlalchemy import JSON, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedMixin, IdMixin, fk_column

ANSWER_TYPES = ("text", "number", "single_choice", "multi_choice", "postal_code", "boolean")


class Question(IdMixin, CreatedMixin, Base):
    __tablename__ = "questions"

    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    service_id: Mapped[int | None] = fk_column("services.id", nullable=True, ondelete="CASCADE")
    question_text: Mapped[str] = mapped_column(String(500))
    answer_type: Mapped[str] = mapped_column(Enum(*ANSWER_TYPES), default="text")
    options: Mapped[Any | None] = mapped_column(JSON)
    is_required: Mapped[bool] = mapped_column(default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(default=True)

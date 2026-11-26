from datetime import datetime
from decimal import Decimal

from sqlalchemy import CHAR, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT, MEDIUMBLOB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UNITS, IdMixin, TimestampMixin, fk_column

QUOTE_STATUSES = ("draft", "pending", "validated", "sent", "accepted", "rejected", "expired")
# Résultat du DERNIER envoi e-mail au client (l'envoi est synchrone : jamais de
# « pending » orphelin). "none" = jamais tenté.
EMAIL_STATUSES = ("none", "sent", "failed")


class Quote(IdMixin, TimestampMixin, Base):
    __tablename__ = "quotes"
    __table_args__ = (UniqueConstraint("company_id", "reference", name="uq_quotes_reference"),)

    company_id: Mapped[int] = fk_column("companies.id", nullable=False, ondelete="CASCADE")
    conversation_id: Mapped[int | None] = fk_column(
        "conversations.id", nullable=True, ondelete="SET NULL"
    )
    service_id: Mapped[int | None] = fk_column("services.id", nullable=True, ondelete="SET NULL")
    reference: Mapped[str] = mapped_column(String(40))
    customer_first_name: Mapped[str | None] = mapped_column(String(100))
    customer_last_name: Mapped[str | None] = mapped_column(String(100))
    customer_email: Mapped[str | None] = mapped_column(String(255))
    customer_phone: Mapped[str | None] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(Enum(*QUOTE_STATUSES), default="draft")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    # Remise globale : pourcentage ou montant en euros (null = pas de remise).
    discount_type: Mapped[str | None] = mapped_column(Enum("percent", "amount"))
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=20)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    currency: Mapped[str] = mapped_column(CHAR(3), default="EUR")
    notes: Mapped[str | None] = mapped_column(Text)
    # FK cyclique vers quote_versions : use_alter crée la contrainte après les deux tables.
    current_version_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "quote_versions.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_quotes_current_version",
        ),
        nullable=True,
    )
    created_by: Mapped[int | None] = fk_column("users.id", nullable=True, ondelete="SET NULL")
    validated_by: Mapped[int | None] = fk_column("users.id", nullable=True, ondelete="SET NULL")
    sent_at: Mapped[datetime | None]
    # Posé par PATCH /quotes/{id} : un brouillon retouché par l'artisan n'est
    # plus jamais écrasé par un nouveau tour de chat du prospect.
    artisan_edited: Mapped[bool] = mapped_column(default=False)
    email_status: Mapped[str] = mapped_column(Enum(*EMAIL_STATUSES), default="none")
    # Le PDF réellement envoyé au client (immutabilité du document légal :
    # les lignes du devis restent éditables, pas le document parti).
    sent_pdf: Mapped[bytes | None] = mapped_column(MEDIUMBLOB)

    lines: Mapped[list["QuoteLine"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="QuoteLine.position"
    )


# Lignes de devis : prix et libellé figés (snapshot) à la génération.
class QuoteLine(IdMixin, Base):
    __tablename__ = "quote_lines"

    quote_id: Mapped[int] = fk_column("quotes.id", nullable=False, ondelete="CASCADE")
    price_item_id: Mapped[int | None] = fk_column(
        "price_items.id", nullable=True, ondelete="SET NULL"
    )
    label: Mapped[str] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(Enum(*UNITS), default="unit")
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=1)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    position: Mapped[int] = mapped_column(Integer, default=0)

"""Calcul déterministe des devis en Decimal, arrondi au centime.

lignes → sous-total HT → remise → HT net → TVA → TTC
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")

# Types de remise supportés (aligné sur la colonne quotes.discount_type).
DISCOUNT_TYPES = ("percent", "amount")


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class LineInput:
    label: str
    unit: str
    unit_price: Decimal
    quantity: Decimal


@dataclass(frozen=True)
class ComputedLine:
    label: str
    unit: str
    unit_price: Decimal
    quantity: Decimal
    line_total: Decimal


@dataclass(frozen=True)
class QuoteComputation:
    lines: list[ComputedLine]
    subtotal: Decimal  # HT brut (somme des lignes)
    discount_amount: Decimal  # remise en euros (0 si aucune)
    net_subtotal: Decimal  # HT après remise (assiette de la TVA)
    tax_rate: Decimal
    tax_amount: Decimal
    total: Decimal


def compute_line_total(unit_price: Decimal, quantity: Decimal) -> Decimal:
    return _money(unit_price * quantity)


# Remise en euros (pourcentage ou montant), bornée à [0, subtotal].
def compute_discount(
    subtotal: Decimal, discount_type: str | None, value: Decimal
) -> Decimal:
    if discount_type not in DISCOUNT_TYPES or value <= 0:
        return Decimal("0.00")
    if discount_type == "percent":
        amount = _money(subtotal * value / Decimal(100))
    else:
        amount = _money(value)
    return min(amount, subtotal)


# Calcule un devis complet ; tax_rate en pourcentage (20 = 20 %).
def compute_quote(
    lines: list[LineInput],
    tax_rate: Decimal,
    discount_type: str | None = None,
    discount_value: Decimal = Decimal("0"),
) -> QuoteComputation:
    computed = [
        ComputedLine(
            label=line.label,
            unit=line.unit,
            unit_price=line.unit_price,
            quantity=line.quantity,
            line_total=compute_line_total(line.unit_price, line.quantity),
        )
        for line in lines
    ]
    subtotal = _money(sum((line.line_total for line in computed), Decimal(0)))
    discount_amount = compute_discount(subtotal, discount_type, discount_value)
    net_subtotal = _money(subtotal - discount_amount)
    tax_amount = _money(net_subtotal * tax_rate / Decimal(100))
    total = _money(net_subtotal + tax_amount)
    return QuoteComputation(
        lines=computed,
        subtotal=subtotal,
        discount_amount=discount_amount,
        net_subtotal=net_subtotal,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        total=total,
    )

"""Taux de TVA d'un devis généré par le chat.

Company.default_vat_rate est un ratio (0.200), compute_quote attend un pourcentage (20).
Priorité : franchise (0 %) > taux de l'arbre > défaut entreprise.
"""

from decimal import Decimal

from app.models import Company

# Valeur de repli
FALLBACK_RATE_PERCENT = Decimal("20")


# Convertit le ratio stocké en base (0.200) vers le pourcentage moteur (20.00).
def ratio_to_percent(ratio: Decimal) -> Decimal:
    return (Decimal(ratio) * 100).quantize(Decimal("0.01"))


def applicable_tax_rate(company: Company, *, tree_rate: Decimal | None = None) -> Decimal:
    if company.vat_exempt:
        return Decimal("0")
    if tree_rate is not None:
        return tree_rate
    if company.default_vat_rate is None:
        return FALLBACK_RATE_PERCENT
    return ratio_to_percent(company.default_vat_rate)

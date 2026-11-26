"""Taux de TVA applicable à un devis généré par le chat.

PIÈGE D'UNITÉS : `Company.default_vat_rate` est stocké en RATIO (Numeric(4,3),
0.200 = 20 %) alors que le moteur de chiffrage (`compute_quote`) et
`Quote.tax_rate` travaillent en POURCENT (Decimal("20")). Toute consommation
du réglage entreprise passe par ce module — jamais de conversion inline.

Priorité du taux :

    vat_exempt (franchise art. 293 B du CGI)  →  0 %, écrase tout
        │ sinon
    taux porté par l'arbre de qualification   →  le chantier décide (10/20/5,5)
        │ sinon
    Company.default_vat_rate                  →  défaut de l'entreprise
"""

from decimal import Decimal

from app.models import Company

# Filet de sécurité si le réglage entreprise est absent (ne devrait pas arriver :
# la colonne a un défaut en base).
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

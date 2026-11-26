"""Construit un devis depuis une demande extraite.

Les prix viennent toujours de la grille ; le LLM ne fournit que postes et quantités.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from app.services.eligibility import check_eligibility
from app.services.pricing_engine import LineInput, QuoteComputation, compute_quote


# Un poste de la grille tarifaire (source de vérité des prix).
@dataclass(frozen=True)
class PriceItemRef:
    id: int
    label: str
    unit: str
    unit_price: Decimal


# Un poste retenu par l'extraction : identifiant de la grille + quantité.
@dataclass(frozen=True)
class ExtractedItem:
    price_item_id: int
    quantity: Decimal


# Résultat du build : soit un devis chiffré, soit un motif de lead (non chiffrable).
@dataclass(frozen=True)
class BuildResult:
    computation: QuoteComputation | None  # None → non chiffrable
    price_item_ids: tuple[int, ...]  # aligné position par position avec computation.lines
    lead_reason: str | None  # None → chiffrable (motif aligné sur LEAD_REASONS sinon)


def build_quote(
    *,
    service_slug: str | None,
    postal_code: str | None,
    items: Iterable[ExtractedItem],
    grille: Iterable[PriceItemRef],
    supported_services: Iterable[str],
    served_postal_codes: Iterable[str],
    tax_rate: Decimal,
) -> BuildResult:
    eligible, reason = check_eligibility(
        service_slug=service_slug,
        postal_code=postal_code,
        supported_services=supported_services,
        served_postal_codes=served_postal_codes,
    )
    if not eligible:
        return BuildResult(computation=None, price_item_ids=(), lead_reason=reason)

    by_id = {ref.id: ref for ref in grille}
    resolved: list[tuple[int, LineInput]] = []
    for item in items:
        ref = by_id.get(item.price_item_id)
        # Ignore postes inconnus et quantités ≤ 0
        if ref is None or item.quantity <= 0:
            continue
        resolved.append(
            (
                ref.id,
                LineInput(
                    label=ref.label,
                    unit=ref.unit,
                    unit_price=ref.unit_price,
                    quantity=item.quantity,
                ),
            )
        )

    if not resolved:
        return BuildResult(computation=None, price_item_ids=(), lead_reason="incomplete")

    computation = compute_quote([line for _, line in resolved], tax_rate)
    return BuildResult(
        computation=computation,
        price_item_ids=tuple(pid for pid, _ in resolved),
        lead_reason=None,
    )

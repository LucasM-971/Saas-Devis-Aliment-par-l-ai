"""Extraction structurée d'une demande de devis. Le LLM n'invente jamais de prix."""

from pydantic import ValidationError

from app.llm.client import LLMUnavailable, _conversation, _structured_call
from app.llm.prompts import build_extraction_prompt
from app.llm.schemas import CatalogItem, ExtractionResult, HistoryMessage, ServiceRef


# Schéma de sortie par entreprise : services et postes limités à la grille via enum.
def _extraction_schema(catalog: list[CatalogItem], services: list[ServiceRef]) -> dict:
    # Enum vide interdit : null seul, ou chaîne libre sans catalogue
    service_slug = (
        {"enum": [s.slug for s in services] + [None]} if services else {"type": "null"}
    )
    price_item_id = {"enum": [c.id for c in catalog]} if catalog else {"type": "string"}

    return {
        "type": "object",
        "properties": {
            "service_slug": service_slug,
            "postal_code": {"type": ["string", "null"]},
            "customer": {
                "type": "object",
                "properties": {
                    "first_name": {"type": ["string", "null"]},
                    "last_name": {"type": ["string", "null"]},
                    "email": {"type": ["string", "null"]},
                    "phone": {"type": ["string", "null"]},
                },
                "required": ["first_name", "last_name", "email", "phone"],
                "additionalProperties": False,
            },
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "price_item_id": price_item_id,
                        "quantity": {"type": "number"},
                    },
                    "required": ["price_item_id", "quantity"],
                    "additionalProperties": False,
                },
            },
            "notes": {"type": ["string", "null"]},
        },
        "required": ["service_slug", "postal_code", "customer", "items", "notes"],
        "additionalProperties": False,
    }


# Analyse la conversation et renvoie la demande extraite (sans aucun prix).
def extract(
    *,
    message: str,
    company_name: str,
    history: list[HistoryMessage],
    catalog: list[CatalogItem],
    services: list[ServiceRef],
) -> ExtractionResult:
    data = _structured_call(
        system=build_extraction_prompt(company_name, catalog, services),
        # Historique complet pour ne rien perdre des premiers tours
        messages=_conversation(history, message, limit=None),
        schema=_extraction_schema(catalog, services),
    )

    try:
        result = ExtractionResult.model_validate(data)
    except ValidationError as exc:
        raise LLMUnavailable("Extraction LLM invalide") from exc

    # Quantités ≤ 0 ignorées
    result.items = [item for item in result.items if item.quantity > 0]
    return result

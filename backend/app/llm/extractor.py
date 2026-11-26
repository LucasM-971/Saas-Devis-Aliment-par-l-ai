"""Extraction structurée d'une demande de devis à partir de la conversation.

Le LLM qualifie et extrait (service, code postal, quantités par poste, coordonnées) ;
il ne calcule jamais de prix. Le chiffrage déterministe est fait ailleurs par
`app.services.quote_builder` à partir de la grille tarifaire en base.
"""

from pydantic import ValidationError

from app.llm.client import LLMUnavailable, _conversation, _structured_call
from app.llm.prompts import build_extraction_prompt
from app.llm.schemas import CatalogItem, ExtractionResult, HistoryMessage, ServiceRef


# Schéma de sortie structuré, construit par entreprise : les slugs de services et les
# identifiants du catalogue sont injectés comme enum, le modèle ne peut donc pas
# inventer un service ou un poste absent de la grille.
# Tous les champs sont requis (contrainte des structured outputs) ; les valeurs absentes sont null.
def _extraction_schema(catalog: list[CatalogItem], services: list[ServiceRef]) -> dict:
    # enum vide interdit par JSON Schema : sans services, seul null est possible ;
    # sans catalogue, on retombe sur une chaîne libre (ids invalides ignorés en aval).
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
        # Historique complet : les faits énoncés aux premiers tours (surface,
        # adresse) ne doivent jamais sortir de la fenêtre d'extraction.
        messages=_conversation(history, message, limit=None),
        schema=_extraction_schema(catalog, services),
    )

    try:
        result = ExtractionResult.model_validate(data)
    except ValidationError as exc:
        raise LLMUnavailable("Extraction LLM invalide") from exc

    # minimum/maximum non supportés par les structured outputs : les quantités
    # nulles ou négatives sont écartées ici (poste inchiffrable).
    result.items = [item for item in result.items if item.quantity > 0]
    return result

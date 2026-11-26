import json
import types

import pytest

from app.config import settings
from app.llm import client as llm
from app.llm import extractor
from app.llm.schemas import CatalogItem, ExtractionResult, HistoryMessage, ServiceRef

CATALOG = [CatalogItem(id="1", label="Peinture murs", unit="m2", service_slug="peinture")]
SERVICES = [ServiceRef(slug="peinture", name="Peinture")]


def test_extract_sans_cle_leve_llm_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    with pytest.raises(extractor.LLMUnavailable):
        extractor.extract(
            message="Bonjour", company_name="X", history=[], catalog=CATALOG, services=SERVICES
        )


# Installe un client Anthropic simulé qui renvoie `payload` et capture les kwargs d'appel.
def _fake_client(monkeypatch, payload: dict) -> dict:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")
    captured: dict = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        block = types.SimpleNamespace(type="text", text=json.dumps(payload))
        return types.SimpleNamespace(content=[block])

    fake = types.SimpleNamespace(messages=types.SimpleNamespace(create=fake_create))
    monkeypatch.setattr(llm, "_client", lambda: fake)
    return captured


def test_extract_parse_la_sortie_structuree(monkeypatch):
    captured = _fake_client(
        monkeypatch,
        {
            "service_slug": "peinture",
            "postal_code": "75016",
            "customer": {
                "first_name": "Alice",
                "last_name": None,
                "email": None,
                "phone": None,
            },
            "items": [{"price_item_id": "1", "quantity": 24}],
            "notes": None,
        },
    )

    result = extractor.extract(
        message="Je veux repeindre 24 m² à Paris 16e",
        company_name="Atelier Dupont",
        history=[HistoryMessage(role="assistant", content="Bonjour !")],
        catalog=CATALOG,
        services=SERVICES,
    )

    assert isinstance(result, ExtractionResult)
    assert result.service_slug == "peinture"
    assert result.postal_code == "75016"
    assert result.customer.first_name == "Alice"
    assert result.items[0].price_item_id == "1"
    assert result.items[0].quantity == 24
    # La sortie structurée est bien demandée et l'historique transmis avant le message courant.
    assert captured["output_config"]["format"]["type"] == "json_schema"
    assert captured["messages"][0] == {"role": "assistant", "content": "Bonjour !"}
    assert captured["messages"][-1]["role"] == "user"
    # Le catalogue (avec les identifiants de la grille) est injecté dans le prompt système.
    assert "[1] Peinture murs" in captured["system"][0]["text"]


def test_schema_contraint_slugs_et_ids_du_catalogue(monkeypatch):
    captured = _fake_client(
        monkeypatch,
        {
            "service_slug": None,
            "postal_code": None,
            "customer": {"first_name": None, "last_name": None, "email": None, "phone": None},
            "items": [],
            "notes": None,
        },
    )

    extractor.extract(
        message="Bonjour", company_name="X", history=[], catalog=CATALOG, services=SERVICES
    )

    schema = captured["output_config"]["format"]["schema"]
    # Le modèle ne peut renvoyer qu'un slug connu (ou null) et un id du catalogue.
    assert schema["properties"]["service_slug"] == {"enum": ["peinture", None]}
    assert schema["properties"]["items"]["items"]["properties"]["price_item_id"] == {
        "enum": ["1"]
    }


def test_schema_sans_catalogue_ni_services(monkeypatch):
    captured = _fake_client(
        monkeypatch,
        {
            "service_slug": None,
            "postal_code": None,
            "customer": {"first_name": None, "last_name": None, "email": None, "phone": None},
            "items": [],
            "notes": None,
        },
    )

    extractor.extract(message="Bonjour", company_name="X", history=[], catalog=[], services=[])

    schema = captured["output_config"]["format"]["schema"]
    # enum vide interdit : sans services seul null est possible, sans catalogue chaîne libre.
    assert schema["properties"]["service_slug"] == {"type": "null"}
    assert schema["properties"]["items"]["items"]["properties"]["price_item_id"] == {
        "type": "string"
    }


def test_extract_ecarte_les_quantites_non_positives(monkeypatch):
    _fake_client(
        monkeypatch,
        {
            "service_slug": "peinture",
            "postal_code": None,
            "customer": {"first_name": None, "last_name": None, "email": None, "phone": None},
            "items": [
                {"price_item_id": "1", "quantity": 0},
                {"price_item_id": "1", "quantity": -3},
                {"price_item_id": "1", "quantity": 12.5},
            ],
            "notes": None,
        },
    )

    result = extractor.extract(
        message="12,5 m²", company_name="X", history=[], catalog=CATALOG, services=SERVICES
    )

    assert [(i.price_item_id, i.quantity) for i in result.items] == [("1", 12.5)]

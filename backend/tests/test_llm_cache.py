"""Cache TTL des réponses du chat : mêmes entrées → une seule requête API."""

import json
import types

import pytest

from app.config import settings
from app.llm import client as llm
from app.llm.schemas import HistoryMessage


@pytest.fixture(autouse=True)
def _cache_vide():
    llm.clear_reply_cache()
    yield
    llm.clear_reply_cache()


# Client Anthropic simulé qui compte les appels.
def _fake_client(monkeypatch, payload: dict) -> dict:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")
    calls = {"count": 0}

    def fake_create(**kwargs):
        calls["count"] += 1
        block = types.SimpleNamespace(type="text", text=json.dumps(payload))
        return types.SimpleNamespace(content=[block])

    fake = types.SimpleNamespace(messages=types.SimpleNamespace(create=fake_create))
    monkeypatch.setattr(llm, "_client", lambda: fake)
    return calls


def _reply(message: str, history: list[HistoryMessage] | None = None):
    return llm.generate_reply(
        message=message,
        company_name="Atelier Dupont",
        qas=[],
        blocs=[],
        history=history or [],
        prix_m2=None,
    )


def test_meme_question_servie_depuis_le_cache(monkeypatch):
    calls = _fake_client(monkeypatch, {"answer": "Bonjour !", "buttons": []})
    first = _reply("Bonjour")
    second = _reply("Bonjour")
    assert calls["count"] == 1
    assert first.answer == second.answer == "Bonjour !"


def test_question_differente_rappelle_l_api(monkeypatch):
    calls = _fake_client(monkeypatch, {"answer": "Réponse", "buttons": []})
    _reply("Bonjour")
    _reply("Vos tarifs ?")
    assert calls["count"] == 2


def test_historique_different_rappelle_l_api(monkeypatch):
    calls = _fake_client(monkeypatch, {"answer": "Réponse", "buttons": []})
    _reply("Et ensuite ?")
    _reply("Et ensuite ?", history=[HistoryMessage(role="user", content="Contexte différent")])
    assert calls["count"] == 2


def test_entree_expiree_rappelle_l_api(monkeypatch):
    calls = _fake_client(monkeypatch, {"answer": "Réponse", "buttons": []})
    _reply("Bonjour")
    # Simule l'expiration : on avance l'horloge au-delà du TTL.
    real_monotonic = llm.time.monotonic
    monkeypatch.setattr(llm.time, "monotonic", lambda: real_monotonic() + llm.CACHE_TTL_SECONDS + 1)
    _reply("Bonjour")
    assert calls["count"] == 2


def test_la_reponse_en_cache_est_une_copie(monkeypatch):
    _fake_client(monkeypatch, {"answer": "Réponse", "buttons": ["A"]})
    first = _reply("Bonjour")
    first.buttons.append("mutation")
    second = _reply("Bonjour")
    assert second.buttons == ["A"]


def test_reponse_vide_non_mise_en_cache(monkeypatch):
    calls = _fake_client(monkeypatch, {"answer": "  ", "buttons": []})
    with pytest.raises(llm.LLMUnavailable):
        _reply("Bonjour")
    with pytest.raises(llm.LLMUnavailable):
        _reply("Bonjour")
    assert calls["count"] == 2

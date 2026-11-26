import httpx
import pytest

from app.config import settings
from app.llm import client as llm


class _Resp:
    def __init__(self, status: int, payload: dict):
        self.status_code = status
        self._payload = payload

    def raise_for_status(self):
        if self.status_code >= 400:
            req = httpx.Request("POST", "https://x")
            raise httpx.HTTPStatusError("err", request=req, response=httpx.Response(self.status_code, request=req))

    def json(self):
        return self._payload


@pytest.fixture
def gemini(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    llm.clear_reply_cache()


def test_gemini_reponse_structuree(gemini, monkeypatch):
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update(url=url, headers=headers, body=json)
        return _Resp(200, {"candidates": [{"content": {"parts": [{"text": '{"answer": "Bonjour", "buttons": ["Devis"]}'}]}}]})

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    data = llm._structured_call(
        system="sys",
        messages=[{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}],
        schema={"type": "object"},
    )
    assert data == {"answer": "Bonjour", "buttons": ["Devis"]}
    assert captured["headers"]["x-goog-api-key"] == "test-key"
    assert [c["role"] for c in captured["body"]["contents"]] == ["user", "model"]


def test_gemini_sans_cle(gemini, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    with pytest.raises(llm.LLMUnavailable):
        llm._structured_call(system="s", messages=[], schema={})


def test_gemini_erreur_http(gemini, monkeypatch):
    monkeypatch.setattr(llm.httpx, "post", lambda *a, **k: _Resp(429, {}))
    with pytest.raises(llm.LLMUnavailable, match="429"):
        llm._structured_call(system="s", messages=[], schema={})


@pytest.fixture
def mistral(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "mistral")
    monkeypatch.setattr(settings, "mistral_api_key", "test-key")


def test_mistral_reponse_structuree(mistral, monkeypatch):
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update(headers=headers, body=json)
        return _Resp(200, {"choices": [{"message": {"content": '{"answer": "Salut", "buttons": []}'}}]})

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    data = llm._structured_call(system="sys", messages=[{"role": "user", "content": "a"}], schema={})
    assert data == {"answer": "Salut", "buttons": []}
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["body"]["messages"][0] == {"role": "system", "content": "sys"}


def test_mistral_sans_cle(mistral, monkeypatch):
    monkeypatch.setattr(settings, "mistral_api_key", "")
    with pytest.raises(llm.LLMUnavailable, match="MISTRAL"):
        llm._structured_call(system="s", messages=[], schema={})


def test_mistral_erreur_http(mistral, monkeypatch):
    monkeypatch.setattr(llm.httpx, "post", lambda *a, **k: _Resp(401, {}))
    with pytest.raises(llm.LLMUnavailable, match="401"):
        llm._structured_call(system="s", messages=[], schema={})


@pytest.fixture
def ollama(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "ollama")
    monkeypatch.setattr(settings, "ollama_url", "http://ollama:11434/")


def test_ollama_reponse_structuree(ollama, monkeypatch):
    captured = {}

    def fake_post(url, json, timeout):
        captured.update(url=url, body=json)
        return _Resp(200, {"message": {"content": '{"answer": "Coucou", "buttons": ["A"]}'}})

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    data = llm._structured_call(system="sys", messages=[{"role": "user", "content": "a"}], schema={"type": "object"})
    assert data == {"answer": "Coucou", "buttons": ["A"]}
    assert captured["url"] == "http://ollama:11434/api/chat"
    assert captured["body"]["format"] == {"type": "object"}
    assert captured["body"]["stream"] is False


def test_ollama_injoignable(ollama, monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(llm.httpx, "post", boom)
    with pytest.raises(llm.LLMUnavailable, match="injoignable"):
        llm._structured_call(system="s", messages=[], schema={})

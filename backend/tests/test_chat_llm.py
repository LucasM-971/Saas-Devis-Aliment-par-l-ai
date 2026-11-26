import json
import os
import types
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.config import settings
from app.database import Base, get_db
from app.llm import client as llm
from app.llm.prompts import build_system_prompt
from app.llm.schemas import BlocItem, ChatResponse, HistoryMessage, QAItem
from app.main import app
from app.models import Company, WidgetSettings

TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "mysql+pymysql://devis:devis@localhost:3306/devis_ai_test"
)

QAS = [QAItem(question="Le devis est-il gratuit ?", answer="Oui, c'est gratuit.")]
BLOCS = [
    BlocItem(
        trigger="je veux un devis",
        text="Quel type de projet ?",
        buttons=["Travaux neufs", "Rénovation"],
    )
]


@pytest.fixture
def env():
    try:
        engine = create_engine(TEST_URL)
        engine.connect().close()
    except Exception:
        pytest.skip("MySQL de test indisponible")

    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestingSession, TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


# Entreprise active avec sa base de connaissances persistée dans WidgetSettings.
def _seed_company(TestingSession) -> str:
    session = TestingSession()
    company = Company(
        public_id=str(uuid.uuid4()),
        name="Atelier Dupont",
        slug=f"atelier-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    session.add(company)
    session.flush()
    session.add(
        WidgetSettings(
            company_id=company.id,
            config={
                "qas": [q.model_dump() for q in QAS],
                "blocs": [b.model_dump() for b in BLOCS],
                "prix_m2": "45",
            },
        )
    )
    session.commit()
    public_id = company.public_id
    session.close()
    return public_id


# Client Anthropic simulé : capture les kwargs et renvoie une réponse structurée.
def _fake_llm(monkeypatch, captured: dict):
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")

    def fake_create(**kwargs):
        captured.update(kwargs)
        payload = json.dumps({"answer": "Oui, le devis est gratuit.", "buttons": ["Obtenir un devis"]})
        block = types.SimpleNamespace(type="text", text=payload)
        return types.SimpleNamespace(content=[block])

    fake_client = types.SimpleNamespace(messages=types.SimpleNamespace(create=fake_create))
    monkeypatch.setattr(llm, "_client", lambda: fake_client)


# ─── Construction du prompt système ──────────────────────────────────────────


def test_system_prompt_inclut_la_base_de_connaissances():
    prompt = build_system_prompt("Atelier Dupont", QAS, BLOCS, prix_m2="45")
    assert "Atelier Dupont" in prompt
    assert "Le devis est-il gratuit ?" in prompt
    assert "je veux un devis" in prompt
    assert "Travaux neufs" in prompt
    assert "45 €/m²" in prompt
    # La règle sur le tarif n'apparaît que si un prix est fourni.
    assert "prix total ferme" in prompt


def test_system_prompt_sans_prix_omet_la_regle_tarif():
    prompt = build_system_prompt("X", QAS, BLOCS, prix_m2=None)
    assert "prix total ferme" not in prompt


def test_system_prompt_base_vide():
    prompt = build_system_prompt("X", [], [], prix_m2=None)
    assert "Aucune information configurée" in prompt


def test_system_prompt_oriente_la_qualification():
    prompt = build_system_prompt("X", QAS, BLOCS, prix_m2=None)
    # Le bot doit collecter, dans l'ordre : prestation, quantités, code postal, coordonnées.
    assert "QUALIFICATION DE LA DEMANDE" in prompt
    assert "code postal" in prompt
    assert "UNE seule question" in prompt


# ─── Nettoyage des boutons ───────────────────────────────────────────────────


def test_clean_buttons_limite_a_trois():
    out = llm.clean_buttons(["a", "b", "c", "d", "e"])
    assert out == ["a", "b", "c"]


def test_clean_buttons_retire_vides_et_doublons():
    out = llm.clean_buttons(["  Devis  ", "", "devis", "Prix"])
    assert out == ["Devis", "Prix"]


def test_clean_buttons_tronque_les_libelles_longs():
    out = llm.clean_buttons(["x" * 100])
    assert len(out[0]) == llm.MAX_BUTTON_LEN


# ─── Disponibilité du LLM ────────────────────────────────────────────────────


def test_generate_reply_sans_cle_leve_llm_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    with pytest.raises(llm.LLMUnavailable):
        llm.generate_reply(
            message="Bonjour",
            company_name="X",
            qas=QAS,
            blocs=BLOCS,
            history=[],
            prix_m2=None,
        )


def test_endpoint_renvoie_503_sans_cle(env, monkeypatch):
    TestingSession, api = env
    public_id = _seed_company(TestingSession)
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    resp = api.post(
        "/api/v1/chat/message",
        json={"company_public_id": public_id, "message": "Bonjour"},
    )
    assert resp.status_code == 503


def test_endpoint_entreprise_inconnue_renvoie_404(env):
    _TestingSession, api = env
    resp = api.post(
        "/api/v1/chat/message",
        json={"company_public_id": str(uuid.uuid4()), "message": "Bonjour"},
    )
    assert resp.status_code == 404


# ─── Endpoint public : la base de connaissances vient de la base, pas du corps ─


def test_endpoint_lit_la_kb_en_base_et_ignore_celle_du_corps(env, monkeypatch):
    TestingSession, api = env
    public_id = _seed_company(TestingSession)
    captured: dict = {}
    _fake_llm(monkeypatch, captured)

    resp = api.post(
        "/api/v1/chat/message",
        json={
            "company_public_id": public_id,
            "message": "Le devis est gratuit ?",
            # Champs de l'ancien contrat : ignorés, plus de proxy Claude ouvert.
            "company_name": "Entreprise Injectée",
            "qas": [{"question": "QA INJECTÉE", "answer": "RÉPONSE INJECTÉE"}],
            "prix_m2": "999",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["answer"] == "Oui, le devis est gratuit."

    system_text = captured["system"][0]["text"]
    # Le prompt système est construit depuis la base (nom + KB de WidgetSettings)…
    assert "Atelier Dupont" in system_text
    assert "Le devis est-il gratuit ?" in system_text
    assert "45 €/m²" in system_text
    # …et rien de ce que le corps tente d'injecter n'y figure.
    assert "Entreprise Injectée" not in system_text
    assert "QA INJECTÉE" not in system_text


# ─── Aperçu du dashboard : KB non sauvegardée, mais endpoint authentifié ──────


def test_preview_exige_une_authentification(env):
    _TestingSession, api = env
    resp = api.post("/api/v1/widget/preview/message", json={"message": "Bonjour"})
    assert resp.status_code == 401


def test_preview_utilise_la_kb_du_corps(env, monkeypatch):
    _TestingSession, api = env
    token = api.post(
        "/api/v1/auth/register",
        json={"email": "pro@acme.fr", "password": "motdepasse", "company_name": "Acme"},
    ).json()["access_token"]
    captured: dict = {}
    _fake_llm(monkeypatch, captured)

    resp = api.post(
        "/api/v1/widget/preview/message",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "message": "Le devis est gratuit ?",
            "qas": [{"question": "QA brouillon", "answer": "Réponse brouillon"}],
        },
    )
    assert resp.status_code == 200

    system_text = captured["system"][0]["text"]
    # L'aperçu teste bien la KB non sauvegardée envoyée dans le corps,
    # avec le nom d'entreprise lu en base (jamais fourni par le client).
    assert "QA brouillon" in system_text
    assert "Acme" in system_text


# ─── Parcours complet avec un client Anthropic simulé ────────────────────────


def test_generate_reply_parse_la_reponse_structuree(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")

    captured = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        payload = json.dumps(
            {"answer": "Oui, le devis est **gratuit**.", "buttons": ["Obtenir un devis", "", "Obtenir un devis"]}
        )
        block = types.SimpleNamespace(type="text", text=payload)
        return types.SimpleNamespace(content=[block])

    fake_client = types.SimpleNamespace(messages=types.SimpleNamespace(create=fake_create))
    monkeypatch.setattr(llm, "_client", lambda: fake_client)

    reply = llm.generate_reply(
        message="Le devis est gratuit ?",
        company_name="Atelier Dupont",
        qas=QAS,
        blocs=BLOCS,
        history=[HistoryMessage(role="assistant", content="Bonjour !")],
        prix_m2="45",
    )

    assert isinstance(reply, ChatResponse)
    assert reply.answer == "Oui, le devis est **gratuit**."
    # Doublon retiré, vide ignoré.
    assert reply.buttons == ["Obtenir un devis"]
    # La sortie structurée est bien demandée.
    assert captured["output_config"]["format"]["type"] == "json_schema"
    # L'historique est transmis avant le message courant.
    assert captured["messages"][0] == {"role": "assistant", "content": "Bonjour !"}
    assert captured["messages"][-1] == {"role": "user", "content": "Le devis est gratuit ?"}


def test_generate_reply_rejette_une_reponse_vide(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")

    def fake_create(**kwargs):
        payload = json.dumps({"answer": "   ", "buttons": []})
        block = types.SimpleNamespace(type="text", text=payload)
        return types.SimpleNamespace(content=[block])

    fake_client = types.SimpleNamespace(messages=types.SimpleNamespace(create=fake_create))
    monkeypatch.setattr(llm, "_client", lambda: fake_client)

    # Réponse vide inaffichable → LLMUnavailable, le front bascule sur le matching local.
    with pytest.raises(llm.LLMUnavailable):
        llm.generate_reply(
            message="Bonjour",
            company_name="X",
            qas=QAS,
            blocs=BLOCS,
            history=[],
            prix_m2=None,
        )


def test_filter_buttons_drops_fake_contacts():
    from app.llm.client import filter_buttons

    asks = "Pouvez-vous me donner votre prénom et vos coordonnées ?"
    assert filter_buttons(asks, ["Jean Dupont", "06 12 34 56 78"]) == []
    assert filter_buttons("Quelle surface ?", ["19 m²", "a@b.fr", "06 12 34 56 78"]) == ["19 m²"]

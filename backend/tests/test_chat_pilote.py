"""Comportements pilote du chat public : persistance par tour, idempotence du
devis (1 conversation = 1 brouillon vivant), TVA entreprise, et la régression
« même session_uid chez deux entreprises » (ex-500)."""

import os
import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.database import Base, get_db
from app.llm import client as llm_client
from app.llm import extractor
from app.llm.schemas import (
    ChatResponse,
    ExtractedCustomer,
    ExtractedLineItem,
    ExtractionResult,
)
from app.main import app
from app.models import Company, Conversation, PriceItem, Quote, QuoteVersion, Service, ServiceZone

TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "mysql+pymysql://devis:devis@localhost:3306/devis_ai_test"
)


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


def _seed(TestingSession, *, name="Atelier Dupont", vat_rate=None, vat_exempt=False):
    session = TestingSession()
    company = Company(
        public_id=str(uuid.uuid4()),
        name=name,
        slug=f"atelier-{uuid.uuid4().hex[:8]}",
        is_active=True,
        vat_exempt=vat_exempt,
    )
    if vat_rate is not None:
        company.default_vat_rate = vat_rate
    session.add(company)
    session.flush()
    service = Service(company_id=company.id, name="Peinture", slug="peinture", is_active=True)
    session.add(service)
    session.flush()
    session.add(
        ServiceZone(company_id=company.id, label="Paris 16e", postal_code="75016", is_active=True)
    )
    item = PriceItem(
        company_id=company.id,
        service_id=service.id,
        label="Peinture murs",
        unit="m2",
        unit_price=Decimal("45"),
        is_active=True,
    )
    session.add(item)
    session.commit()
    public_id, item_id, company_id = company.public_id, item.id, company.id
    session.close()
    return public_id, item_id, company_id


def _fake_extract(item_id, quantity):
    def fake(**kwargs):
        return ExtractionResult(
            service_slug="peinture",
            postal_code="75016",
            customer=ExtractedCustomer(first_name="Alice", email="alice@example.fr"),
            items=[ExtractedLineItem(price_item_id=str(item_id), quantity=quantity)],
        )

    return fake


# ─── Régression : collision cross-company de session_uid (ex-IntegrityError 500) ─


def test_meme_session_uid_chez_deux_entreprises(env, monkeypatch):
    TestingSession, client = env
    public_a, item_a, company_a = _seed(TestingSession, name="Atelier A")
    public_b, item_b, company_b = _seed(TestingSession, name="Atelier B")
    session_uid = str(uuid.uuid4())

    monkeypatch.setattr(extractor, "extract", _fake_extract(item_a, 24))
    resp_a = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_a, "message": "24 m²", "session_uid": session_uid},
    )
    assert resp_a.status_code == 200 and resp_a.json()["outcome"] == "quote"

    monkeypatch.setattr(extractor, "extract", _fake_extract(item_b, 10))
    resp_b = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_b, "message": "10 m²", "session_uid": session_uid},
    )
    # Avant le fix : IntegrityError (session_uid unique globalement) → 500.
    assert resp_b.status_code == 200 and resp_b.json()["outcome"] == "quote"

    check = TestingSession()
    conversations = check.scalars(
        select(Conversation).where(Conversation.session_uid == session_uid)
    ).all()
    assert {c.company_id for c in conversations} == {company_a, company_b}
    check.close()


# ─── Persistance par tour sur /chat/message ───────────────────────────────────


def test_chat_message_persiste_chaque_tour(env, monkeypatch):
    TestingSession, client = env
    public_id, _item_id, company_id = _seed(TestingSession)

    monkeypatch.setattr(
        llm_client, "generate_reply",
        lambda **kwargs: ChatResponse(answer="Bonjour ! Quelle surface ?", buttons=[]),
    )

    resp = client.post(
        "/api/v1/chat/message",
        json={"company_public_id": public_id, "message": "Bonjour"},
    )
    assert resp.status_code == 200
    session_uid = resp.json()["session_uid"]
    assert session_uid  # généré par le serveur quand le client n'en envoie pas

    check = TestingSession()
    conversation = check.scalar(
        select(Conversation).where(
            Conversation.company_id == company_id, Conversation.session_uid == session_uid
        )
    )
    assert conversation is not None and conversation.status == "open"
    assert [e["role"] for e in conversation.transcript] == ["user", "assistant"]
    assert all(e.get("ts") for e in conversation.transcript)
    assert conversation.last_activity_at is not None
    check.close()

    # Deuxième tour avec le même uid : la conversation est reprise, pas dupliquée.
    resp2 = client.post(
        "/api/v1/chat/message",
        json={"company_public_id": public_id, "message": "20 m²", "session_uid": session_uid},
    )
    assert resp2.status_code == 200 and resp2.json()["session_uid"] == session_uid

    check = TestingSession()
    conversations = check.scalars(
        select(Conversation).where(Conversation.company_id == company_id)
    ).all()
    assert len(conversations) == 1
    assert len(conversations[0].transcript) == 4
    check.close()


def test_echec_llm_garde_le_tour_utilisateur(env, monkeypatch):
    TestingSession, client = env
    public_id, _item_id, company_id = _seed(TestingSession)

    def boom(**kwargs):
        raise llm_client.LLMUnavailable("clé absente")

    monkeypatch.setattr(llm_client, "generate_reply", boom)

    resp = client.post(
        "/api/v1/chat/message",
        json={"company_public_id": public_id, "message": "Bonjour"},
    )
    assert resp.status_code == 503

    # Le tour utilisateur est déjà en base : la demande n'est pas perdue.
    check = TestingSession()
    conversation = check.scalar(
        select(Conversation).where(Conversation.company_id == company_id)
    )
    assert conversation is not None
    assert [e["role"] for e in conversation.transcript] == ["user"]
    check.close()


# ─── Idempotence : 1 conversation = 1 brouillon vivant ────────────────────────


def test_double_appel_renvoie_le_meme_brouillon(env, monkeypatch):
    TestingSession, client = env
    public_id, item_id, company_id = _seed(TestingSession)
    session_uid = str(uuid.uuid4())
    monkeypatch.setattr(extractor, "extract", _fake_extract(item_id, 24))

    payload = {"company_public_id": public_id, "message": "24 m²", "session_uid": session_uid}
    first = client.post("/api/v1/chat/quote", json=payload).json()
    second = client.post("/api/v1/chat/quote", json=payload).json()

    assert first["quote"]["reference"] == second["quote"]["reference"]
    check = TestingSession()
    quotes = check.scalars(select(Quote).where(Quote.company_id == company_id)).all()
    assert len(quotes) == 1  # double-clic ≠ doublon
    check.close()


def test_demande_enrichie_met_a_jour_le_meme_brouillon(env, monkeypatch):
    TestingSession, client = env
    public_id, item_id, company_id = _seed(TestingSession)
    session_uid = str(uuid.uuid4())

    monkeypatch.setattr(extractor, "extract", _fake_extract(item_id, 24))
    first = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "24 m²", "session_uid": session_uid},
    ).json()
    assert first["quote"]["total"] == 1296.0  # 45 × 24 × 1,20

    monkeypatch.setattr(extractor, "extract", _fake_extract(item_id, 30))
    second = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "Finalement 30 m²", "session_uid": session_uid},
    ).json()
    assert second["quote"]["reference"] == first["quote"]["reference"]
    assert second["quote"]["total"] == 1620.0  # 45 × 30 × 1,20 — MIS À JOUR

    check = TestingSession()
    quotes = check.scalars(select(Quote).where(Quote.company_id == company_id)).all()
    assert len(quotes) == 1 and float(quotes[0].total) == 1620.0
    # Chaque génération laisse un snapshot IA (métrique « sans retouche »).
    versions = check.scalars(
        select(QuoteVersion).where(QuoteVersion.quote_id == quotes[0].id)
    ).all()
    assert [v.version_number for v in versions] == [1, 2]
    assert all(v.source == "ai" for v in versions)
    check.close()


def test_brouillon_retouche_par_artisan_jamais_ecrase(env, monkeypatch):
    TestingSession, client = env
    public_id, item_id, company_id = _seed(TestingSession)
    session_uid = str(uuid.uuid4())

    monkeypatch.setattr(extractor, "extract", _fake_extract(item_id, 24))
    first = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "24 m²", "session_uid": session_uid},
    ).json()

    session = TestingSession()
    quote = session.scalar(select(Quote).where(Quote.company_id == company_id))
    quote.artisan_edited = True
    session.commit()
    session.close()

    monkeypatch.setattr(extractor, "extract", _fake_extract(item_id, 30))
    second = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "Finalement 30 m²", "session_uid": session_uid},
    ).json()
    # Le brouillon retouché est renvoyé TEL QUEL, pas recalculé.
    assert second["quote"]["reference"] == first["quote"]["reference"]
    assert second["quote"]["total"] == 1296.0

    check = TestingSession()
    assert float(check.scalar(select(Quote).where(Quote.company_id == company_id)).total) == 1296.0
    check.close()


def test_devis_engage_jamais_ecrase(env, monkeypatch):
    TestingSession, client = env
    public_id, item_id, company_id = _seed(TestingSession)
    session_uid = str(uuid.uuid4())

    monkeypatch.setattr(extractor, "extract", _fake_extract(item_id, 24))
    client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "24 m²", "session_uid": session_uid},
    )

    session = TestingSession()
    quote = session.scalar(select(Quote).where(Quote.company_id == company_id))
    quote.status = "validated"
    session.commit()
    session.close()

    monkeypatch.setattr(extractor, "extract", _fake_extract(item_id, 30))
    second = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "30 m²", "session_uid": session_uid},
    ).json()
    assert second["outcome"] == "quote" and second["quote"]["total"] == 1296.0


# ─── TVA : défaut entreprise (ratio en base) et franchise 293 B ───────────────


def test_tva_defaut_entreprise_appliquee(env, monkeypatch):
    TestingSession, client = env
    # 10 % rénovation : stocké 0.100 en base, appliqué 10 % au devis.
    public_id, item_id, company_id = _seed(TestingSession, vat_rate=Decimal("0.100"))
    monkeypatch.setattr(extractor, "extract", _fake_extract(item_id, 24))

    body = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "24 m²"},
    ).json()
    assert body["quote"]["tax_rate"] == 10.0
    assert body["quote"]["total"] == 1188.0  # 1080 × 1,10 — pas 1080 × 1,001

    check = TestingSession()
    assert float(check.scalar(select(Quote).where(Quote.company_id == company_id)).tax_rate) == 10.0
    check.close()


def test_franchise_tva_devis_sans_tva(env, monkeypatch):
    TestingSession, client = env
    public_id, item_id, _company_id = _seed(TestingSession, vat_exempt=True)
    monkeypatch.setattr(extractor, "extract", _fake_extract(item_id, 24))

    body = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "24 m²"},
    ).json()
    assert body["quote"]["tax_rate"] == 0.0
    assert body["quote"]["total"] == 1080.0  # franchise art. 293 B : pas de TVA


def test_reessai_du_meme_message_ne_duplique_pas_le_tour(env, monkeypatch):
    TestingSession, client = env
    public_id, _item_id, company_id = _seed(TestingSession)

    # 1er essai : le LLM tombe (503), le tour utilisateur est persisté.
    def boom(**kwargs):
        raise llm_client.LLMUnavailable("indisponible")

    monkeypatch.setattr(llm_client, "generate_reply", boom)
    first = client.post(
        "/api/v1/chat/message",
        json={"company_public_id": public_id, "message": "Bonjour"},
    )
    assert first.status_code == 503

    check = TestingSession()
    conversation = check.scalar(select(Conversation).where(Conversation.company_id == company_id))
    session_uid = conversation.session_uid
    check.close()

    # Réessai du MÊME message : le tour n'est pas dupliqué en base.
    monkeypatch.setattr(
        llm_client, "generate_reply",
        lambda **kwargs: ChatResponse(answer="Bonjour !", buttons=[]),
    )
    retry = client.post(
        "/api/v1/chat/message",
        json={"company_public_id": public_id, "message": "Bonjour", "session_uid": session_uid},
    )
    assert retry.status_code == 200

    check = TestingSession()
    conversation = check.scalar(select(Conversation).where(Conversation.company_id == company_id))
    assert [e["role"] for e in conversation.transcript] == ["user", "assistant"]
    check.close()


# ─── Bornes serveur : la taille est plafonnée, pas seulement la fréquence ─────


def test_historique_trop_long_rejete_422(env):
    TestingSession, client = env
    public_id, _item_id, _company_id = _seed(TestingSession)

    history = [{"role": "user", "content": f"tour {i}"} for i in range(61)]
    resp = client.post(
        "/api/v1/chat/message",
        json={"company_public_id": public_id, "message": "Bonjour", "history": history},
    )
    assert resp.status_code == 422


def test_message_trop_long_rejete_422(env):
    TestingSession, client = env
    public_id, _item_id, _company_id = _seed(TestingSession)

    resp = client.post(
        "/api/v1/chat/message",
        json={"company_public_id": public_id, "message": "x" * 2001},
    )
    assert resp.status_code == 422


def test_message_aux_bornes_accepte(env, monkeypatch):
    TestingSession, client = env
    public_id, _item_id, _company_id = _seed(TestingSession)
    monkeypatch.setattr(
        llm_client, "generate_reply",
        lambda **kwargs: ChatResponse(answer="OK", buttons=[]),
    )

    history = [{"role": "user", "content": "tour"} for _ in range(60)]
    resp = client.post(
        "/api/v1/chat/message",
        json={"company_public_id": public_id, "message": "x" * 2000, "history": history},
    )
    assert resp.status_code == 200

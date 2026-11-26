import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.database import Base, get_db
from app.main import app
from app.models import Conversation

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


def _register(client, email, company_name):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "motdepasse", "company_name": company_name},
    )
    token = resp.json()["access_token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    company_id = int(me.json()["memberships"][0]["company"]["id"])
    return token, company_id


def _seed_conversation(TestingSession, company_id):
    session = TestingSession()
    conversation = Conversation(
        company_id=company_id,
        session_uid=str(uuid.uuid4()),
        status="completed",
        transcript=[
            {"role": "assistant", "content": "Bonjour, quel est votre projet ?"},
            {"role": "user", "content": "Repeindre mon salon."},
        ],
    )
    session.add(conversation)
    session.commit()
    conversation_id = conversation.id
    session.close()
    return conversation_id


def test_owner_lit_la_transcription(env):
    TestingSession, client = env
    token, company_id = _register(client, "alice@acme.fr", "Acme")
    conversation_id = _seed_conversation(TestingSession, company_id)

    resp = client.get(
        f"/api/v1/conversations/{conversation_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert len(body["messages"]) == 2
    assert body["messages"][0]["role"] == "assistant"
    assert body["messages"][1]["content"] == "Repeindre mon salon."


def test_conversation_d_une_autre_entreprise_renvoie_404(env):
    TestingSession, client = env
    _token_a, company_a = _register(client, "alice@acme.fr", "Acme")
    conversation_id = _seed_conversation(TestingSession, company_a)

    token_b, _company_b = _register(client, "bob@autre.fr", "Autre")
    resp = client.get(
        f"/api/v1/conversations/{conversation_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404


def test_conversation_requiert_authentification(env):
    _TestingSession, client = env
    assert client.get("/api/v1/conversations/1").status_code == 401

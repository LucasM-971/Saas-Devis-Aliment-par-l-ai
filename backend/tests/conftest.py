"""Fixtures partagées : client API branché sur la base MySQL de test."""

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  (enregistre les modèles dans Base.metadata)
from app.config import settings
from app.core.rate_limit import reset_all_limiters
from app.database import Base, get_db
from app.main import app

TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "mysql+pymysql://devis:devis@localhost:3306/devis_ai_test"
)


# Le rate limiting est coupé par défaut (TestClient = une seule IP pour toute la
# suite) ; les tests dédiés le réactivent explicitement.
@pytest.fixture(autouse=True)
def _sans_rate_limit(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", False)
    reset_all_limiters()
    yield
    reset_all_limiters()


# Les tests LLM simulent le client Anthropic : on ignore le LLM_PROVIDER du .env local.
@pytest.fixture(autouse=True)
def _provider_anthropic(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "anthropic")


@pytest.fixture
def db_sessionmaker():
    try:
        engine = create_engine(TEST_URL)
        engine.connect().close()
    except Exception:
        pytest.skip("MySQL de test indisponible")

    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    yield TestingSession
    Base.metadata.drop_all(engine)


@pytest.fixture
def client(db_sessionmaker):
    def override_get_db():
        db = db_sessionmaker()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


# Crée un compte + entreprise et renvoie les en-têtes authentifiés.
def register(client: TestClient, email="alice@acme.fr", company_name="Acme") -> dict[str, str]:
    r = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "motdepasse", "company_name": company_name},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

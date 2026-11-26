import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.database import Base, get_db
from app.main import app

TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "mysql+pymysql://devis:devis@localhost:3306/devis_ai_test"
)


@pytest.fixture
def client():
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
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def _register(client, email="alice@acme.fr", password="motdepasse"):
    return client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "company_name": "Acme"},
    )


def test_register_then_me(client):
    token = _register(client).json()["access_token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == "alice@acme.fr"
    assert body["memberships"][0]["role"] == "owner"
    assert body["memberships"][0]["company"]["name"] == "Acme"


def test_login_returns_token(client):
    _register(client)
    r = client.post(
        "/api/v1/auth/login", json={"email": "alice@acme.fr", "password": "motdepasse"}
    )
    assert r.status_code == 200
    assert r.json()["token_type"] == "bearer"


def test_register_duplicate_email_rejected(client):
    _register(client)
    assert _register(client).status_code == 409


def test_login_wrong_password_rejected(client):
    _register(client)
    r = client.post("/api/v1/auth/login", json={"email": "alice@acme.fr", "password": "faux"})
    assert r.status_code == 401


def test_me_requires_authentication(client):
    assert client.get("/api/v1/auth/me").status_code == 401

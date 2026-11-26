import os
import uuid

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


def _register(client, email="pro@acme.fr"):
    token = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "motdepasse", "company_name": "Acme"},
    ).json()["access_token"]
    return token


SAMPLE = {
    "primary_color": "#0EA5E9",
    "greeting_message": "Bonjour, je suis l'assistant Acme.",
    "qas": [{"question": "Le devis est-il gratuit ?", "answer": "Oui, totalement."}],
    "blocs": [
        {
            "trigger": "je veux un devis",
            "label": "Je veux un devis",
            "text": "Quel projet ?",
            "buttons": ["Neuf", "Rénovation"],
        }
    ],
    "prix_m2": "45",
}


def test_publie_puis_config_publique(client):
    token = _register(client)
    auth = {"Authorization": f"Bearer {token}"}

    # /me expose le publicId de l'entreprise (contrat camelCase du front).
    public_id = client.get("/api/v1/auth/me", headers=auth).json()["memberships"][0][
        "company"
    ]["publicId"]
    assert public_id

    # Publication de la configuration (upsert).
    put = client.put("/api/v1/widget/settings", headers=auth, json=SAMPLE)
    assert put.status_code == 200
    assert put.json()["primary_color"] == "#0EA5E9"

    # Rechargement authentifié : la base est bien persistée.
    got = client.get("/api/v1/widget/settings", headers=auth).json()
    assert got["prix_m2"] == "45"
    assert got["qas"][0]["question"] == "Le devis est-il gratuit ?"
    assert got["blocs"][0]["buttons"] == ["Neuf", "Rénovation"]

    # Endpoint public (sans auth) : le widget / la page hébergée lisent la même config.
    cfg = client.get(f"/api/v1/chat/config/{public_id}")
    assert cfg.status_code == 200
    body = cfg.json()
    assert body["company_name"] == "Acme"
    assert body["primary_color"] == "#0EA5E9"
    assert body["greeting_message"] == "Bonjour, je suis l'assistant Acme."
    assert body["qas"][0]["answer"] == "Oui, totalement."
    assert body["blocs"][0]["label"] == "Je veux un devis"


def test_config_par_defaut_sans_publication(client):
    token = _register(client, email="vide@acme.fr")
    auth = {"Authorization": f"Bearer {token}"}
    public_id = client.get("/api/v1/auth/me", headers=auth).json()["memberships"][0][
        "company"
    ]["publicId"]

    # Aucune publication : la config publique renvoie des valeurs par défaut, pas une 404.
    cfg = client.get(f"/api/v1/chat/config/{public_id}")
    assert cfg.status_code == 200
    body = cfg.json()
    assert body["primary_color"] == "#2563EB"
    assert body["qas"] == []


def test_config_entreprise_inconnue_404(client):
    assert client.get(f"/api/v1/chat/config/{uuid.uuid4()}").status_code == 404


def test_settings_requiert_authentification(client):
    assert client.get("/api/v1/widget/settings").status_code == 401
    assert client.put("/api/v1/widget/settings", json=SAMPLE).status_code == 401

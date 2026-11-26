import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.security import create_access_token
from app.database import Base, get_db
from app.main import app
from app.models import Membership, User

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


# Ajoute un membre avec un rôle ; renvoie son token et son id « m… ».
def _seed_member(TestingSession, company_id, email, role):
    session = TestingSession()
    user = User(email=email, password_hash="seeded-no-login", first_name="Test", last_name="User")
    session.add(user)
    session.flush()
    membership = Membership(user_id=user.id, company_id=company_id, role=role, status="active")
    session.add(membership)
    session.commit()
    user_id, membership_id = user.id, membership.id
    session.close()
    return create_access_token(str(user_id)), f"m{membership_id}"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _member_ids(client, token):
    resp = client.get("/api/v1/members", headers=_auth(token))
    return {m["email"]: m["id"] for m in resp.json()}


def test_owner_change_le_role_d_un_membre(env):
    TestingSession, client = env
    owner_token, company_id = _register(client, "alice@acme.fr", "Acme")
    _member_token, member_id = _seed_member(TestingSession, company_id, "bob@acme.fr", "member")

    resp = client.patch(f"/api/v1/members/{member_id}", json={"role": "admin"}, headers=_auth(owner_token))
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"
    reloaded = client.get("/api/v1/members", headers=_auth(owner_token)).json()
    assert next(m for m in reloaded if m["email"] == "bob@acme.fr")["role"] == "admin"


def test_owner_retire_un_membre(env):
    TestingSession, client = env
    owner_token, company_id = _register(client, "alice@acme.fr", "Acme")
    _member_token, member_id = _seed_member(TestingSession, company_id, "bob@acme.fr", "member")

    resp = client.delete(f"/api/v1/members/{member_id}", headers=_auth(owner_token))
    assert resp.status_code == 204
    assert "bob@acme.fr" not in _member_ids(client, owner_token)


def test_membre_sans_droit_ne_peut_ni_modifier_ni_retirer(env):
    TestingSession, client = env
    _owner_token, company_id = _register(client, "alice@acme.fr", "Acme")
    member_token, _member_id = _seed_member(TestingSession, company_id, "bob@acme.fr", "member")
    _other_token, other_id = _seed_member(TestingSession, company_id, "carol@acme.fr", "viewer")

    assert (
        client.patch(f"/api/v1/members/{other_id}", json={"role": "admin"}, headers=_auth(member_token)).status_code
        == 403
    )
    assert client.delete(f"/api/v1/members/{other_id}", headers=_auth(member_token)).status_code == 403


def test_impossible_de_retirer_ou_retrograder_le_dernier_proprietaire(env):
    _TestingSession, client = env
    owner_token, _company_id = _register(client, "alice@acme.fr", "Acme")
    owner_id = _member_ids(client, owner_token)["alice@acme.fr"]

    assert (
        client.patch(f"/api/v1/members/{owner_id}", json={"role": "member"}, headers=_auth(owner_token)).status_code
        == 409
    )
    assert client.delete(f"/api/v1/members/{owner_id}", headers=_auth(owner_token)).status_code == 409


def test_action_sur_membre_d_une_autre_entreprise_renvoie_404(env):
    TestingSession, client = env
    _owner_a, company_a = _register(client, "alice@acme.fr", "Acme")
    _member_token, member_a = _seed_member(TestingSession, company_a, "bob@acme.fr", "member")

    owner_b, _company_b = _register(client, "eve@autre.fr", "Autre")
    assert (
        client.patch(f"/api/v1/members/{member_a}", json={"role": "admin"}, headers=_auth(owner_b)).status_code
        == 404
    )
    assert client.delete(f"/api/v1/members/{member_a}", headers=_auth(owner_b)).status_code == 404


def test_gestion_membres_requiert_authentification(env):
    _TestingSession, client = env
    assert client.patch("/api/v1/members/m1", json={"role": "admin"}).status_code == 401
    assert client.delete("/api/v1/members/m1").status_code == 401


# Un admin ne peut pas modifier un owner.
def test_admin_ne_peut_pas_toucher_un_proprietaire(env):
    TestingSession, client = env
    _owner_token, company_id = _register(client, "alice@acme.fr", "Acme")
    _second_owner, owner_id = _seed_member(TestingSession, company_id, "bob@acme.fr", "owner")
    admin_token, _admin_id = _seed_member(TestingSession, company_id, "carol@acme.fr", "admin")

    assert (
        client.patch(f"/api/v1/members/{owner_id}", json={"role": "member"}, headers=_auth(admin_token)).status_code
        == 403
    )
    assert client.delete(f"/api/v1/members/{owner_id}", headers=_auth(admin_token)).status_code == 403


# Avec deux propriétaires, un owner peut en rétrograder un autre (pas le dernier).
def test_owner_peut_retrograder_un_autre_owner(env):
    TestingSession, client = env
    owner_token, company_id = _register(client, "alice@acme.fr", "Acme")
    _second_owner, owner_id = _seed_member(TestingSession, company_id, "bob@acme.fr", "owner")

    resp = client.patch(f"/api/v1/members/{owner_id}", json={"role": "admin"}, headers=_auth(owner_token))
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"

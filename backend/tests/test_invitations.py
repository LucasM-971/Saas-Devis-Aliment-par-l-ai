"""Invitations d'équipe : envoi, acceptation (nouveau / existant), révocation."""

import pytest

from tests.conftest import register


@pytest.fixture
def emails(monkeypatch):
    sent: list[dict] = []
    monkeypatch.setattr("app.api.v1.invitations.send_email", lambda **kw: sent.append(kw))
    return sent


def _token_from(email: dict) -> str:
    return email["html"].split("token=")[1].split('"')[0]


def test_invitation_puis_acceptation_nouveau_compte(client, emails):
    headers = register(client)
    r = client.post(
        "/api/v1/invitations", json={"email": "karim@acme.fr", "role": "member"}, headers=headers
    )
    assert r.status_code == 201
    assert len(emails) == 1 and emails[0]["to"] == "karim@acme.fr"

    # La page publique lit les détails via le token.
    token = _token_from(emails[0])
    lookup = client.get(f"/api/v1/invitations/lookup/{token}").json()
    assert lookup["companyName"] == "Acme"
    assert lookup["role"] == "member"
    assert lookup["userExists"] is False

    # L'invité crée son compte et ouvre une session sur l'espace Acme.
    r = client.post(
        "/api/v1/invitations/accept",
        json={"token": token, "password": "motdepasse", "first_name": "Karim"},
    )
    assert r.status_code == 200
    invited_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = client.get("/api/v1/auth/me", headers=invited_headers).json()
    assert me["memberships"][0]["company"]["name"] == "Acme"
    assert me["memberships"][0]["role"] == "member"

    # Le token est consommé.
    assert client.get(f"/api/v1/invitations/lookup/{token}").status_code == 400

    # L'invité apparaît comme membre actif.
    members = client.get("/api/v1/members", headers=headers).json()
    karim = next(m for m in members if m["email"] == "karim@acme.fr")
    assert karim["status"] == "active"


def test_acceptation_compte_existant_verifie_le_mot_de_passe(client, emails):
    headers = register(client)
    register(client, email="bob@acme.fr", company_name="Bob & Co")

    client.post("/api/v1/invitations", json={"email": "bob@acme.fr", "role": "viewer"}, headers=headers)
    token = _token_from(emails[0])
    assert client.get(f"/api/v1/invitations/lookup/{token}").json()["userExists"] is True

    # Mauvais mot de passe : refusé, l'invitation reste utilisable.
    r = client.post("/api/v1/invitations/accept", json={"token": token, "password": "mauvais-mdp"})
    assert r.status_code == 401

    r = client.post("/api/v1/invitations/accept", json={"token": token, "password": "motdepasse"})
    assert r.status_code == 200
    bob_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = client.get("/api/v1/auth/me", headers=bob_headers).json()
    assert {m["company"]["name"] for m in me["memberships"]} == {"Acme", "Bob & Co"}


def test_revocation_invalide_le_lien(client, emails):
    headers = register(client)
    client.post("/api/v1/invitations", json={"email": "karim@acme.fr"}, headers=headers)
    token = _token_from(emails[0])

    invited = next(
        m for m in client.get("/api/v1/members", headers=headers).json() if m["status"] == "invited"
    )
    assert invited["id"].startswith("i")
    r = client.delete(f"/api/v1/invitations/{invited['id'][1:]}", headers=headers)
    assert r.status_code == 204

    assert client.get(f"/api/v1/invitations/lookup/{token}").status_code == 400
    assert (
        client.post("/api/v1/invitations/accept", json={"token": token, "password": "motdepasse"}).status_code
        == 400
    )


def test_doublons_et_roles_invalides_rejetes(client, emails):
    headers = register(client)
    client.post("/api/v1/invitations", json={"email": "karim@acme.fr"}, headers=headers)
    # Invitation déjà en attente pour cet e-mail.
    assert (
        client.post("/api/v1/invitations", json={"email": "karim@acme.fr"}, headers=headers).status_code
        == 409
    )
    # Déjà membre (alice elle-même).
    assert (
        client.post("/api/v1/invitations", json={"email": "alice@acme.fr"}, headers=headers).status_code
        == 409
    )
    # Le rôle owner ne se délègue pas.
    assert (
        client.post(
            "/api/v1/invitations", json={"email": "x@acme.fr", "role": "owner"}, headers=headers
        ).status_code
        == 422
    )


def test_invitation_reservee_aux_admins(client, emails, db_sessionmaker):
    from sqlalchemy import select

    from app.models import Membership, User

    register(client)
    bob_headers = register(client, email="bob@acme.fr", company_name="Bob & Co")

    db = db_sessionmaker()
    try:
        alice_company = db.scalar(
            select(Membership.company_id)
            .join(User, Membership.user_id == User.id)
            .where(User.email == "alice@acme.fr")
        )
        bob = db.scalar(select(User).where(User.email == "bob@acme.fr"))
        db.add(Membership(user_id=bob.id, company_id=alice_company, role="member"))
        db.commit()
    finally:
        db.close()

    r = client.post(
        "/api/v1/invitations",
        json={"email": "x@acme.fr"},
        headers={**bob_headers, "X-Company-Id": str(alice_company)},
    )
    assert r.status_code == 403

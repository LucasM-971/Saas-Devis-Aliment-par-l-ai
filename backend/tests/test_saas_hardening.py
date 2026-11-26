"""Durcissement SaaS : zones, onboarding, permissions, rate limit, audit, e-mails."""

import pytest
from sqlalchemy import select

from app.config import settings
from app.core.rate_limit import reset_all_limiters
from app.models import Company, Membership, Service, User
from tests.conftest import register

QUOTE_BODY = {
    "clientName": "Client Test",
    "clientEmail": "client@example.fr",
    "vatRate": 0.2,
    "lines": [{"label": "Peinture", "quantity": 10, "unitPrice": 28, "unit": "m2"}],
}


# Ajoute bob comme membre de l'entreprise d'alice avec le rôle donné.
def _add_member(db_sessionmaker, role: str) -> tuple[dict, str]:
    db = db_sessionmaker()
    try:
        alice_company = db.scalar(
            select(Membership.company_id)
            .join(User, Membership.user_id == User.id)
            .where(User.email == "alice@acme.fr")
        )
        bob = db.scalar(select(User).where(User.email == "bob@acme.fr"))
        db.add(Membership(user_id=bob.id, company_id=alice_company, role=role))
        db.commit()
        return {"X-Company-Id": str(alice_company)}, str(alice_company)
    finally:
        db.close()


# ─── Zones d'intervention ─────────────────────────────────────────────────────


def test_zones_remplacement_et_lecture(client):
    headers = register(client)
    r = client.put(
        "/api/v1/zones",
        json=[{"postalCode": "75011"}, {"postalCode": "75012", "label": "Paris 12"}, {"postalCode": "75011"}],
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert [z["postalCode"] for z in body] == ["75011", "75012"]  # dédupliqué
    assert body[1]["label"] == "Paris 12"

    assert len(client.get("/api/v1/zones", headers=headers).json()) == 2


def test_zone_code_postal_invalide_rejete(client):
    headers = register(client)
    r = client.put("/api/v1/zones", json=[{"postalCode": "7501"}], headers=headers)
    assert r.status_code == 422


# ─── Métier → service chiffrable ──────────────────────────────────────────────


def test_choisir_un_metier_cree_le_service(client, db_sessionmaker):
    headers = register(client)
    r = client.patch("/api/v1/companies/current", json={"metier": "peinture"}, headers=headers)
    assert r.status_code == 200

    db = db_sessionmaker()
    try:
        services = db.scalars(select(Service).where(Service.is_active.is_(True))).all()
        assert [s.slug for s in services] == ["peinture"]
    finally:
        db.close()

    # Changer de métier bascule le service actif
    client.patch("/api/v1/companies/current", json={"metier": "plomberie"}, headers=headers)
    db = db_sessionmaker()
    try:
        actifs = db.scalars(select(Service).where(Service.is_active.is_(True))).all()
        assert [s.slug for s in actifs] == ["plomberie"]
    finally:
        db.close()


def test_metier_inconnu_rejete(client):
    headers = register(client)
    r = client.patch("/api/v1/companies/current", json={"metier": "alchimie"}, headers=headers)
    assert r.status_code == 422


# ─── Onboarding ───────────────────────────────────────────────────────────────


def test_onboarding_progresse_avec_la_configuration(client):
    headers = register(client)
    st = client.get("/api/v1/onboarding", headers=headers).json()
    assert st == {
        "hasMetier": False, "hasCatalog": False, "hasZones": False,
        "hasAssistant": False, "hasQuote": False, "complete": False,
    }

    client.patch("/api/v1/companies/current", json={"metier": "peinture"}, headers=headers)
    client.put("/api/v1/pricing/items", json=[{"label": "Peinture", "unit": "m2", "unitPrice": 28}], headers=headers)
    client.put("/api/v1/zones", json=[{"postalCode": "75011"}], headers=headers)
    client.put(
        "/api/v1/widget/settings",
        json={"primary_color": "#EA580C", "qas": [{"question": "Q", "answer": "R"}], "blocs": [], "prix_m2": None},
        headers=headers,
    )
    st = client.get("/api/v1/onboarding", headers=headers).json()
    assert st["complete"] is True
    assert st["hasQuote"] is False


# ─── Permissions par rôle ─────────────────────────────────────────────────────


def test_viewer_est_en_lecture_seule(client, db_sessionmaker):
    register(client)
    bob_headers = register(client, email="bob@acme.fr", company_name="Bob & Co")
    company_header, _ = _add_member(db_sessionmaker, "viewer")
    headers = {**bob_headers, **company_header}

    assert client.get("/api/v1/quotes", headers=headers).status_code == 200
    assert client.post("/api/v1/quotes", json=QUOTE_BODY, headers=headers).status_code == 403
    assert client.put("/api/v1/zones", json=[], headers=headers).status_code == 403
    assert client.put("/api/v1/pricing/items", json=[], headers=headers).status_code == 403


def test_member_ecrit_les_devis_mais_pas_la_configuration(client, db_sessionmaker):
    register(client)
    bob_headers = register(client, email="bob@acme.fr", company_name="Bob & Co")
    company_header, _ = _add_member(db_sessionmaker, "member")
    headers = {**bob_headers, **company_header}

    assert client.post("/api/v1/quotes", json=QUOTE_BODY, headers=headers).status_code == 201
    assert client.put("/api/v1/pricing/items", json=[], headers=headers).status_code == 403
    assert client.patch("/api/v1/companies/current", json={"name": "X"}, headers=headers).status_code == 403


# ─── Rate limiting ────────────────────────────────────────────────────────────


def test_rate_limit_auth(client, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    reset_all_limiters()
    creds = {"email": "nobody@acme.fr", "password": "mauvais-mdp"}
    statuses = [client.post("/api/v1/auth/login", json=creds).status_code for _ in range(12)]
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429


def test_rate_limit_chat_message(client, db_sessionmaker, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    # L'endpoint public identifie l'entreprise par son public_id (KB lue en base).
    register(client)
    db = db_sessionmaker()
    try:
        public_id = db.scalar(select(Company.public_id).where(Company.name == "Acme"))
    finally:
        db.close()
    reset_all_limiters()
    body = {"company_public_id": public_id, "message": "Bonjour"}
    # Sans clé LLM l'endpoint répond 503, mais le limiteur compte chaque appel.
    statuses = [client.post("/api/v1/chat/message", json=body).status_code for _ in range(22)]
    assert statuses[:20] == [503] * 20
    assert statuses[20] == 429


# ─── Journal d'audit réel ─────────────────────────────────────────────────────


def test_les_actions_alimentent_le_journal(client):
    headers = register(client)
    created = client.post("/api/v1/quotes", json=QUOTE_BODY, headers=headers).json()
    client.patch(f"/api/v1/quotes/{created['id']}/status", json={"status": "pret"}, headers=headers)
    client.put("/api/v1/pricing/items", json=[{"label": "Peinture", "unit": "m2", "unitPrice": 28}], headers=headers)

    entries = client.get("/api/v1/audit", headers=headers).json()
    actions = [(e["type"], e["action"], e["target"]) for e in entries]
    assert ("quote", "a créé le devis", created["reference"]) in actions
    assert ("quote", "a validé le devis", created["reference"]) in actions
    assert ("pricing", "a mis à jour la grille tarifaire", "1 poste") in actions


# ─── Suppression de brouillon ─────────────────────────────────────────────────


def test_suppression_reservee_aux_brouillons(client):
    headers = register(client)
    quote = client.post("/api/v1/quotes", json=QUOTE_BODY, headers=headers).json()

    # Un devis validé ne se supprime pas.
    client.patch(f"/api/v1/quotes/{quote['id']}/status", json={"status": "pret"}, headers=headers)
    assert client.delete(f"/api/v1/quotes/{quote['id']}", headers=headers).status_code == 409

    brouillon = client.post("/api/v1/quotes", json=QUOTE_BODY, headers=headers).json()
    assert client.delete(f"/api/v1/quotes/{brouillon['id']}", headers=headers).status_code == 204
    refs = [q["reference"] for q in client.get("/api/v1/quotes", headers=headers).json()]
    assert brouillon["reference"] not in refs


# ─── Envoi du devis par e-mail ────────────────────────────────────────────────


def test_envoi_devis_par_email(client, monkeypatch):
    sent: list[dict] = []
    monkeypatch.setattr(
        "app.email.sender.send_email", lambda **kw: sent.append(kw)
    )
    # quote_mailer importe send_email par référence : on patche là où il l'utilise.
    monkeypatch.setattr(
        "app.services.quote_mailer.send_email", lambda **kw: sent.append(kw)
    )
    # Le rendu WeasyPrint exige des deps système : mocké ici (couvert par test_quote_pdf).
    monkeypatch.setattr(
        "app.api.v1.quotes.render_quote_pdf", lambda quote, company: b"%PDF-fake"
    )

    headers = register(client)
    quote = client.post("/api/v1/quotes", json=QUOTE_BODY, headers=headers).json()

    # Brouillon → refus (le devis doit être validé d'abord).
    assert client.post(f"/api/v1/quotes/{quote['id']}/send", headers=headers).status_code == 409

    client.patch(f"/api/v1/quotes/{quote['id']}/status", json={"status": "pret"}, headers=headers)
    r = client.post(f"/api/v1/quotes/{quote['id']}/send", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "envoye"
    assert len(sent) == 1
    assert sent[0]["to"] == "client@example.fr"
    assert quote["reference"] in sent[0]["subject"]
    # Le PDF (LE document) est joint à l'e-mail d'accompagnement.
    assert sent[0]["attachments"][0][0] == f"devis-{quote['reference']}.pdf"


def test_envoi_sans_email_client_rejete(client):
    headers = register(client)
    body = {**QUOTE_BODY, "clientEmail": None}
    quote = client.post("/api/v1/quotes", json=body, headers=headers).json()
    client.patch(f"/api/v1/quotes/{quote['id']}/status", json={"status": "pret"}, headers=headers)
    assert client.post(f"/api/v1/quotes/{quote['id']}/send", headers=headers).status_code == 422


# ─── Réinitialisation du mot de passe ─────────────────────────────────────────


def test_reset_password_flow(client, monkeypatch):
    emails: list[dict] = []
    monkeypatch.setattr("app.api.v1.auth.send_email", lambda **kw: emails.append(kw))

    register(client)
    # Email inconnu : même réponse (pas d'énumération), aucun envoi.
    assert client.post("/api/v1/auth/forgot-password", json={"email": "inconnu@x.fr"}).status_code == 204
    assert emails == []

    assert client.post("/api/v1/auth/forgot-password", json={"email": "alice@acme.fr"}).status_code == 204
    assert len(emails) == 1
    token = emails[0]["html"].split("token=")[1].split('"')[0]

    r = client.post("/api/v1/auth/reset-password", json={"token": token, "password": "nouveau-mdp-1"})
    assert r.status_code == 204

    # L'ancien mot de passe ne marche plus, le nouveau oui, le token est consommé.
    assert client.post("/api/v1/auth/login", json={"email": "alice@acme.fr", "password": "motdepasse"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "alice@acme.fr", "password": "nouveau-mdp-1"}).status_code == 200
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "password": "autre-mdp-1"}).status_code == 400


def test_reset_password_token_invalide(client):
    r = client.post("/api/v1/auth/reset-password", json={"token": "bidon", "password": "nouveau-mdp-1"})
    assert r.status_code == 400


# ─── Pagination du journal ────────────────────────────────────────────────────


def test_journal_pagine(client):
    headers = register(client)
    for _ in range(3):
        client.post("/api/v1/quotes", json=QUOTE_BODY, headers=headers)

    page1 = client.get("/api/v1/audit?limit=2&offset=0", headers=headers).json()
    page2 = client.get("/api/v1/audit?limit=2&offset=2", headers=headers).json()
    assert len(page1) == 2 and len(page2) == 1
    assert {e["id"] for e in page1}.isdisjoint({e["id"] for e in page2})

    # Bornes : limite plafonnée, offset négatif refusé.
    assert client.get("/api/v1/audit?limit=1000", headers=headers).status_code == 422
    assert client.get("/api/v1/audit?offset=-1", headers=headers).status_code == 422


# ─── Durcissement e-mail et validation des montants ──────────────────────────


def test_email_client_invalide_rejete(client):
    headers = register(client)
    body = {**QUOTE_BODY, "clientEmail": "pas-un-email"}
    assert client.post("/api/v1/quotes", json=body, headers=headers).status_code == 422
    # Injection d'en-tête : une adresse avec retour à la ligne est refusée.
    body = {**QUOTE_BODY, "clientEmail": "client@example.fr\nBcc: evil@x.fr"}
    assert client.post("/api/v1/quotes", json=body, headers=headers).status_code == 422


def test_email_client_vide_traite_comme_absent(client):
    headers = register(client)
    body = {**QUOTE_BODY, "clientEmail": ""}
    r = client.post("/api/v1/quotes", json=body, headers=headers)
    assert r.status_code == 201
    assert r.json()["clientEmail"] is None


def test_montants_non_finis_rejetes(client):
    # Corps brut avec Infinity (accepté par json.loads)
    headers = register(client)
    raw = (
        '{"clientName": "Client", "vatRate": 0.2,'
        ' "lines": [{"label": "Peinture", "quantity": Infinity, "unitPrice": 28, "unit": "m2"}]}'
    )
    r = client.post(
        "/api/v1/quotes",
        content=raw,
        headers={**headers, "Content-Type": "application/json"},
    )
    assert r.status_code == 422

    r = client.put(
        "/api/v1/pricing/items",
        content='[{"label": "Poste", "unit": "m2", "unitPrice": NaN}]',
        headers={**headers, "Content-Type": "application/json"},
    )
    assert r.status_code == 422


def test_unite_inconnue_rejetee_en_422(client):
    headers = register(client)
    body = {
        **QUOTE_BODY,
        "lines": [{"label": "Peinture", "quantity": 1, "unitPrice": 10, "unit": "parsec"}],
    }
    assert client.post("/api/v1/quotes", json=body, headers=headers).status_code == 422


def test_email_devis_echappe_le_html(client, monkeypatch):
    sent: list[dict] = []
    monkeypatch.setattr("app.services.quote_mailer.send_email", lambda **kw: sent.append(kw))
    monkeypatch.setattr(
        "app.api.v1.quotes.render_quote_pdf", lambda quote, company: b"%PDF-fake"
    )

    headers = register(client)
    # Lignes dans le PDF uniquement ; notes dans l'e-mail
    body = {
        **QUOTE_BODY,
        "notes": '<img src=x onerror="alert(1)">',
        "lines": [{"label": "Peinture", "quantity": 1, "unitPrice": 10, "unit": "unit"}],
    }
    quote = client.post("/api/v1/quotes", json=body, headers=headers).json()
    client.patch(f"/api/v1/quotes/{quote['id']}/status", json={"status": "pret"}, headers=headers)
    assert client.post(f"/api/v1/quotes/{quote['id']}/send", headers=headers).status_code == 200

    html = sent[0]["html"]
    assert "<img src=x" not in html
    assert "&lt;img src=x" in html


def test_en_tetes_email_sans_saut_de_ligne():
    from app.email.sender import _header_value

    assert _header_value("Devis DEV-1\r\nBcc: evil@x.fr") == "Devis DEV-1 Bcc: evil@x.fr"
    assert _header_value("normal") == "normal"

"""Durcissement issu de la revue sécurité : bornes des entrées publiques,
session_uid inter-entreprises, troncature des extractions LLM, verrouillage
des devis envoyés, invalidation des liens de réinitialisation."""

import uuid
from decimal import Decimal

from sqlalchemy import select

from app.core.security import create_access_token
from app.llm import extractor
from app.llm.schemas import (
    MAX_HISTORY_MESSAGES,
    ExtractedCustomer,
    ExtractedLineItem,
    ExtractionResult,
)
from app.models import Company, Conversation, PriceItem, Quote, Service, ServiceZone
from tests.conftest import register

QUOTE_BODY = {
    "clientName": "Client Test",
    "clientEmail": "client@example.fr",
    "vatRate": 0.2,
    "lines": [{"label": "Peinture", "quantity": 10, "unitPrice": 28, "unit": "m2"}],
}


# Crée une entreprise active minimale et renvoie (public_id, company_id).
def _seed_company(db_sessionmaker, name: str) -> tuple[str, int]:
    db = db_sessionmaker()
    try:
        company = Company(
            public_id=str(uuid.uuid4()),
            name=name,
            slug=f"{name.lower()}-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        db.add(company)
        db.commit()
        return company.public_id, company.id
    finally:
        db.close()


# Ajoute service + zone + poste chiffrable (parcours devis complet).
def _seed_catalog(db_sessionmaker, company_id: int) -> int:
    db = db_sessionmaker()
    try:
        service = Service(company_id=company_id, name="Peinture", slug="peinture", is_active=True)
        db.add(service)
        db.flush()
        db.add(ServiceZone(company_id=company_id, label="Paris", postal_code="75016", is_active=True))
        item = PriceItem(
            company_id=company_id,
            service_id=service.id,
            label="Peinture murs",
            unit="m2",
            unit_price=Decimal("45"),
            is_active=True,
        )
        db.add(item)
        db.commit()
        return item.id
    finally:
        db.close()


# ─── session_uid (surface publique) ───────────────────────────────────────────


def test_session_uid_dune_autre_entreprise_ne_provoque_pas_de_500(
    client, db_sessionmaker, monkeypatch
):
    public_a, company_a = _seed_company(db_sessionmaker, "Alpha")
    public_b, company_b = _seed_company(db_sessionmaker, "Beta")
    monkeypatch.setattr(extractor, "extract", lambda **kw: ExtractionResult())

    session_uid = str(uuid.uuid4())
    r = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_a, "message": "Bonjour", "session_uid": session_uid},
    )
    assert r.status_code == 200

    # Rejouer le même session_uid sur une autre entreprise ne doit ni écraser la
    # conversation d'Alpha, ni provoquer de 500 : l'unicité de session_uid est
    # désormais PAR entreprise (migration conversations_pilote), donc Beta obtient
    # sa propre conversation distincte portant le même uid.
    r = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_b, "message": "Bonjour", "session_uid": session_uid},
    )
    assert r.status_code == 200

    db = db_sessionmaker()
    try:
        conv_a = db.scalar(select(Conversation).where(Conversation.company_id == company_a))
        conv_b = db.scalar(select(Conversation).where(Conversation.company_id == company_b))
        assert conv_a is not None and conv_a.session_uid == session_uid
        # Conversation distincte de celle d'Alpha (non écrasée) ; même uid autorisé
        # d'une entreprise à l'autre.
        assert conv_b is not None and conv_b.id != conv_a.id
        assert conv_b.session_uid == session_uid
    finally:
        db.close()


def test_session_uid_trop_long_rejete_en_422(client):
    r = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": str(uuid.uuid4()), "message": "Bonjour", "session_uid": "s" * 37},
    )
    assert r.status_code == 422


# ─── Bornes des messages publics (coût LLM) ───────────────────────────────────


def test_message_trop_long_rejete_en_422(client):
    for path in ("/api/v1/chat/message", "/api/v1/chat/quote"):
        r = client.post(
            path, json={"company_public_id": str(uuid.uuid4()), "message": "x" * 4001}
        )
        assert r.status_code == 422, path


def test_historique_trop_long_rejete_en_422(client):
    history = [{"role": "user", "content": "Bonjour"}] * (MAX_HISTORY_MESSAGES + 1)
    r = client.post(
        "/api/v1/chat/message",
        json={"company_public_id": str(uuid.uuid4()), "message": "Bonjour", "history": history},
    )
    assert r.status_code == 422


# ─── Troncature des coordonnées extraites par le LLM ──────────────────────────


def test_coordonnees_extraites_trop_longues_sont_tronquees(
    client, db_sessionmaker, monkeypatch
):
    public_id, company_id = _seed_company(db_sessionmaker, "Gamma")
    item_id = _seed_catalog(db_sessionmaker, company_id)

    def fake_extract(**kwargs):
        return ExtractionResult(
            service_slug="peinture",
            postal_code="75016",
            customer=ExtractedCustomer(
                first_name="A" * 300,
                last_name="B" * 300,
                # Pas un e-mail : doit être écarté (il servirait de destinataire SMTP),
                # pas tronqué en une adresse corrompue.
                email="e" * 300,
                phone="0" * 60,
            ),
            items=[ExtractedLineItem(price_item_id=str(item_id), quantity=10)],
        )

    monkeypatch.setattr(extractor, "extract", fake_extract)

    r = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "Repeindre 10 m²"},
    )
    assert r.status_code == 200
    assert r.json()["outcome"] == "quote"

    db = db_sessionmaker()
    try:
        quote = db.scalar(select(Quote).where(Quote.company_id == company_id))
        assert len(quote.customer_first_name) == 100
        assert len(quote.customer_last_name) == 100
        assert quote.customer_email is None
        assert len(quote.customer_phone) == 30
    finally:
        db.close()


def test_email_extrait_valide_est_conserve(client, db_sessionmaker, monkeypatch):
    public_id, company_id = _seed_company(db_sessionmaker, "Delta")
    item_id = _seed_catalog(db_sessionmaker, company_id)

    def fake_extract(**kwargs):
        return ExtractionResult(
            service_slug="peinture",
            postal_code="75016",
            customer=ExtractedCustomer(email="alice@example.fr"),
            items=[ExtractedLineItem(price_item_id=str(item_id), quantity=10)],
        )

    monkeypatch.setattr(extractor, "extract", fake_extract)

    r = client.post(
        "/api/v1/chat/quote",
        json={"company_public_id": public_id, "message": "Repeindre 10 m²"},
    )
    assert r.status_code == 200

    db = db_sessionmaker()
    try:
        quote = db.scalar(select(Quote).where(Quote.company_id == company_id))
        assert quote.customer_email == "alice@example.fr"
    finally:
        db.close()


# ─── Verrouillage du contenu d'un devis envoyé / clos ─────────────────────────


def test_devis_envoye_non_modifiable(client):
    headers = register(client)
    quote = client.post("/api/v1/quotes", json=QUOTE_BODY, headers=headers).json()

    # brouillon → prêt → envoyé (transitions autorisées par la machine à états).
    assert (
        client.patch(
            f"/api/v1/quotes/{quote['id']}/status", json={"status": "pret"}, headers=headers
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/api/v1/quotes/{quote['id']}/status", json={"status": "envoye"}, headers=headers
        ).status_code
        == 200
    )

    r = client.patch(f"/api/v1/quotes/{quote['id']}", json=QUOTE_BODY, headers=headers)
    assert r.status_code == 409


def test_devis_brouillon_reste_modifiable(client):
    headers = register(client)
    quote = client.post("/api/v1/quotes", json=QUOTE_BODY, headers=headers).json()
    r = client.patch(f"/api/v1/quotes/{quote['id']}", json=QUOTE_BODY, headers=headers)
    assert r.status_code == 200


# ─── Réinitialisation : un reset consomme tous les liens en circulation ───────


def test_reset_password_invalide_les_autres_jetons(client, monkeypatch):
    emails: list[dict] = []
    monkeypatch.setattr("app.api.v1.auth.send_email", lambda **kw: emails.append(kw))

    register(client)
    assert client.post("/api/v1/auth/forgot-password", json={"email": "alice@acme.fr"}).status_code == 204
    assert client.post("/api/v1/auth/forgot-password", json={"email": "alice@acme.fr"}).status_code == 204
    tokens = [e["html"].split("token=")[1].split('"')[0] for e in emails]
    assert len(tokens) == 2

    # Le second lien est utilisé : le premier doit être consommé lui aussi.
    assert (
        client.post(
            "/api/v1/auth/reset-password", json={"token": tokens[1], "password": "nouveau-mdp-1"}
        ).status_code
        == 204
    )
    assert (
        client.post(
            "/api/v1/auth/reset-password", json={"token": tokens[0], "password": "autre-mdp-1"}
        ).status_code
        == 400
    )


# ─── Bornes d'entrée alignées sur les colonnes MySQL ──────────────────────────


def test_register_champs_trop_longs_rejetes_en_422(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "trop@long.fr", "password": "motdepasse", "company_name": "x" * 200},
    )
    assert r.status_code == 422

    r = client.post(
        "/api/v1/auth/register",
        json={
            "email": "trop2@long.fr",
            "password": "motdepasse",
            "company_name": "Acme",
            "first_name": "x" * 150,
        },
    )
    assert r.status_code == 422


def test_widget_settings_bornes_en_422(client):
    headers = register(client)
    r = client.put(
        "/api/v1/widget/settings",
        json={"primary_color": "#123456789ABC"},
        headers=headers,
    )
    assert r.status_code == 422

    r = client.put(
        "/api/v1/widget/settings",
        json={"greeting_message": "x" * 501},
        headers=headers,
    )
    assert r.status_code == 422


# ─── Token au sujet non numérique → 401, pas 500 ─────────────────────────────


def test_token_sub_non_numerique_renvoie_401(client):
    token = create_access_token("pas-un-id")
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401

"""API companies : fiche entreprise, mise à jour, profil utilisateur."""

from tests.conftest import register


def test_fiche_entreprise_courante(client):
    headers = register(client)
    r = client.get("/api/v1/companies/current", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Acme"
    assert body["plan"] == "free"
    assert body["defaultVatRate"] == 0.2


def test_mise_a_jour_fiche_entreprise(client):
    headers = register(client)
    r = client.patch(
        "/api/v1/companies/current",
        json={
            "name": "Acme Rénov",
            "siret": "123 456 789 00010",
            "address": "1 rue des Artisans, Paris",
            "defaultVatRate": 0.1,
            "metier": "peinture",
        },
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Acme Rénov"
    assert body["siret"] == "123 456 789 00010"
    assert body["defaultVatRate"] == 0.1
    assert body["metier"] == "peinture"

    # La fiche mise à jour est visible dans /me (source du front).
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["memberships"][0]["company"]["metier"] == "peinture"


def test_mise_a_jour_mentions_legales(client):
    """Les champs de mentions légales sont persistés et remontent dans /me."""
    headers = register(client)
    r = client.patch(
        "/api/v1/companies/current",
        json={
            "legalForm": "SASU",
            "shareCapital": "5 000 €",
            "rcsRm": "RCS Paris 900 123 456",
            "apeCode": "4334Z",
            "vatNumber": "FR12900123456",
            "vatExempt": True,
            "insuranceName": "AXA France",
            "insuranceContract": "N° 123456789",
            "insuranceCoverage": "France métropolitaine",
            "mediatorName": "CM2C",
            "mediatorUrl": "https://cm2c.net",
        },
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["legalForm"] == "SASU"
    assert body["shareCapital"] == "5 000 €"
    assert body["vatNumber"] == "FR12900123456"
    assert body["vatExempt"] is True
    assert body["insuranceName"] == "AXA France"
    assert body["mediatorUrl"] == "https://cm2c.net"

    # Les mentions légales sont visibles dans /me (source du front → PDF).
    me = client.get("/api/v1/auth/me", headers=headers).json()
    company = me["memberships"][0]["company"]
    assert company["insuranceCoverage"] == "France métropolitaine"
    assert company["vatExempt"] is True


def test_valeurs_par_defaut_mentions_legales(client):
    """Une entreprise fraîche n'a aucune mention légale (hors franchise TVA = false)."""
    headers = register(client)
    body = client.get("/api/v1/companies/current", headers=headers).json()
    assert body["legalForm"] is None
    assert body["insuranceName"] is None
    assert body["vatExempt"] is False


def test_mise_a_jour_partielle_ne_touche_pas_le_reste(client):
    headers = register(client)
    client.patch("/api/v1/companies/current", json={"siret": "999"}, headers=headers)
    body = client.patch("/api/v1/companies/current", json={"address": "ici"}, headers=headers).json()
    assert body["siret"] == "999"
    assert body["address"] == "ici"


def test_fiche_requiert_authentification(client):
    assert client.get("/api/v1/companies/current").status_code == 401


def test_mise_a_jour_profil(client):
    headers = register(client)
    r = client.patch(
        "/api/v1/auth/me", json={"first_name": "Alice", "last_name": "Durand"}, headers=headers
    )
    assert r.status_code == 200
    body = r.json()
    assert body["first_name"] == "Alice"
    assert body["last_name"] == "Durand"


# ─── Conversion d'un prospect en devis ────────────────────────────────────────


def _create_lead(db_sessionmaker, email: str):
    from sqlalchemy import select

    from app.models import Company, Lead

    db = db_sessionmaker()
    try:
        company_id = db.scalar(select(Company.id).where(Company.name == "Acme"))
        lead = Lead(company_id=company_id, first_name="Léa", last_name="Petit",
                    email=email, phone="0600000000", reason="incomplete")
        db.add(lead)
        db.commit()
        return str(lead.id)
    finally:
        db.close()


def test_conversion_prospect_cree_un_brouillon(client, db_sessionmaker):
    headers = register(client)
    lead_id = _create_lead(db_sessionmaker, "lea@example.fr")

    r = client.post(f"/api/v1/leads/{lead_id}/convert", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["quoteId"] is not None

    # Le devis créé est un brouillon pré-rempli avec le prospect.
    quotes = client.get("/api/v1/quotes", headers=headers).json()
    assert quotes[0]["id"] == body["quoteId"]
    assert quotes[0]["status"] == "brouillon"
    assert quotes[0]["clientEmail"] == "lea@example.fr"

    # Une seconde conversion est refusée.
    assert client.post(f"/api/v1/leads/{lead_id}/convert", headers=headers).status_code == 409


# ─── Préférences de notifications ─────────────────────────────────────────────


def test_preferences_notifications_persistees(client):
    headers = register(client)
    me = client.get("/api/v1/auth/me", headers=headers).json()
    # Défauts appliqués tant que rien n'est enregistré.
    assert me["notification_prefs"]["new_lead"] is True
    assert me["notification_prefs"]["quote_refused"] is False

    r = client.patch(
        "/api/v1/auth/me",
        json={"notification_prefs": {"new_lead": False, "weekly": False, "inconnue": True}},
        headers=headers,
    )
    assert r.status_code == 200
    prefs = r.json()["notification_prefs"]
    assert prefs["new_lead"] is False
    assert prefs["weekly"] is False
    # Les clés inconnues sont écartées, les absentes retombent sur les défauts.
    assert "inconnue" not in prefs
    assert prefs["quote_accepted"] is True

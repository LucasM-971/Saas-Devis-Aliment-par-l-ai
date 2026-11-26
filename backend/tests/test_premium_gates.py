"""Gates premium : quota de devis, personnalisation du modèle, multi-entreprises."""

from tests.conftest import register

QUOTE_BODY = {
    "clientName": "Client Test",
    "vatRate": 0.2,
    "lines": [{"label": "Peinture", "quantity": 10, "unitPrice": 28, "unit": "m2"}],
}


def _set_plan(client, headers, plan: str) -> None:
    r = client.post("/api/v1/billing/plan", json={"plan": plan}, headers=headers)
    assert r.status_code == 200, r.text


# ─── GET /billing/plan ────────────────────────────────────────────────────────


def test_plan_par_defaut_free_avec_quota(client):
    headers = register(client)
    r = client.get("/api/v1/billing/plan", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["plan"] == "free"
    assert body["features"]["quote_customization"] is False
    assert body["quoteQuota"] == {"used": 0, "limit": 10}


def test_passage_premium_debloque_les_features(client):
    headers = register(client)
    _set_plan(client, headers, "premium")
    body = client.get("/api/v1/billing/plan", headers=headers).json()
    assert body["plan"] == "premium"
    assert body["features"]["quote_customization"] is True
    assert body["quoteQuota"]["limit"] is None


def test_plan_inconnu_rejete(client):
    headers = register(client)
    r = client.post("/api/v1/billing/plan", json={"plan": "platine"}, headers=headers)
    assert r.status_code == 422


# ─── Quota mensuel de devis ───────────────────────────────────────────────────


def test_quota_free_bloque_le_11e_devis(client):
    headers = register(client)
    for _ in range(10):
        assert client.post("/api/v1/quotes", json=QUOTE_BODY, headers=headers).status_code == 201
    r = client.post("/api/v1/quotes", json=QUOTE_BODY, headers=headers)
    assert r.status_code == 403
    assert "Premium" in r.json()["detail"]
    # Le quota est bien reflété par l'API billing.
    quota = client.get("/api/v1/billing/plan", headers=headers).json()["quoteQuota"]
    assert quota == {"used": 10, "limit": 10}


def test_quota_premium_illimite(client):
    headers = register(client)
    _set_plan(client, headers, "premium")
    for _ in range(11):
        assert client.post("/api/v1/quotes", json=QUOTE_BODY, headers=headers).status_code == 201


# ─── Personnalisation du modèle de devis ──────────────────────────────────────


def test_template_bloque_en_free(client):
    headers = register(client)
    r = client.patch("/api/v1/quote-templates", json={"accentColor": "#ff0000"}, headers=headers)
    assert r.status_code == 403
    assert "Premium" in r.json()["detail"]


def test_template_autorise_en_premium(client):
    headers = register(client)
    _set_plan(client, headers, "premium")
    r = client.patch("/api/v1/quote-templates", json={"accentColor": "#ff0000"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["accentColor"] == "#ff0000"


def test_template_lecture_libre_en_free(client):
    headers = register(client)
    assert client.get("/api/v1/quote-templates", headers=headers).status_code == 200


# ─── Multi-entreprises ────────────────────────────────────────────────────────


def test_deuxieme_entreprise_bloquee_en_free(client):
    headers = register(client)
    r = client.post("/api/v1/companies", json={"name": "Deuxième"}, headers=headers)
    assert r.status_code == 403
    assert "Premium" in r.json()["detail"]


def test_deuxieme_entreprise_autorisee_en_premium(client):
    headers = register(client)
    _set_plan(client, headers, "premium")
    r = client.post("/api/v1/companies", json={"name": "Deuxième", "metier": "peinture"}, headers=headers)
    assert r.status_code == 201
    assert r.json()["name"] == "Deuxième"
    # La nouvelle entreprise apparaît dans /me.
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert len(me["memberships"]) == 2


def test_changement_de_plan_reserve_au_owner(client, db_sessionmaker):
    from sqlalchemy import select

    from app.models import Membership, User

    headers = register(client)
    bob_headers = register(client, email="bob@acme.fr", company_name="Bob & Co")

    # Bob devient simple membre de l'entreprise d'Alice.
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
        "/api/v1/billing/plan",
        json={"plan": "premium"},
        headers={**bob_headers, "X-Company-Id": str(alice_company)},
    )
    assert r.status_code == 403

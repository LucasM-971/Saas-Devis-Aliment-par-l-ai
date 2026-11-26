"""Endpoints publics consommés par la landing : compteurs réels + catalogue d'offres."""

from tests.conftest import register


# ── GET /api/v1/stats/platform ────────────────────────────────────────────────


def test_platform_stats_sans_auth(client):
    res = client.get("/api/v1/stats/platform")
    assert res.status_code == 200
    assert res.json() == {
        "quotesGenerated": 0,
        "companiesRegistered": 0,
        "leadsCaptured": 0,
    }


def test_platform_stats_compte_les_entreprises(client):
    register(client)
    register(client, email="bob@bati.fr", company_name="Bati")

    body = client.get("/api/v1/stats/platform").json()
    assert body["companiesRegistered"] == 2
    assert body["quotesGenerated"] == 0


def test_platform_stats_compte_les_devis(client):
    headers = register(client)
    res = client.post(
        "/api/v1/quotes",
        headers=headers,
        json={
            "clientName": "Client Test",
            "clientEmail": "client@test.fr",
            "lines": [{"label": "Peinture", "unit": "m2", "quantity": 10, "unitPrice": 25}],
            "vatRate": 0.2,
        },
    )
    assert res.status_code == 201, res.text

    body = client.get("/api/v1/stats/platform").json()
    assert body["quotesGenerated"] == 1


# ── GET /api/v1/billing/plans ─────────────────────────────────────────────────


def test_billing_plans_sans_auth(client):
    res = client.get("/api/v1/billing/plans")
    assert res.status_code == 200
    plans = res.json()
    assert [p["id"] for p in plans] == ["free", "premium"]


def test_billing_plans_refletent_les_gates(client):
    plans = {p["id"]: p for p in client.get("/api/v1/billing/plans").json()}

    free, premium = plans["free"], plans["premium"]
    # Le quota affiché est celui réellement appliqué par l'API (features.py).
    assert free["quoteLimit"] == 10
    assert any("10 devis" in f for f in free["features"])
    assert premium["quoteLimit"] is None
    assert any("illimités" in f for f in premium["features"])
    # Les fonctionnalités gated premium n'apparaissent pas sur le plan gratuit.
    assert not any("Personnalisation" in f for f in free["features"])
    assert any("Personnalisation" in f for f in premium["features"])
    assert premium["featured"] is True

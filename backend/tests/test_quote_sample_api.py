"""Devis « exemple » importable via POST /api/v1/quotes/sample."""

from tests.conftest import register


def test_import_exemple_cree_un_brouillon_editable(client):
    headers = register(client)
    r = client.post("/api/v1/quotes/sample", headers=headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "brouillon"
    assert body["clientName"] == "Client exemple"
    assert len(body["lines"]) >= 1
    assert body["notes"]  # conditions pré-remplies (validité, acompte, délai)

    # L'exemple apparaît dans la liste et reste modifiable comme un devis normal.
    quotes = client.get("/api/v1/quotes", headers=headers).json()
    assert any(q["id"] == body["id"] for q in quotes)

    edited = client.patch(
        f"/api/v1/quotes/{body['id']}",
        json={
            "clientName": "Vrai client",
            "vatRate": body["vatRate"],
            "lines": [{"label": "Poste modifié", "quantity": 1, "unitPrice": 100, "unit": "unit"}],
        },
        headers=headers,
    )
    assert edited.status_code == 200
    assert edited.json()["clientName"] == "Vrai client"


def test_import_exemple_suit_le_metier(client):
    headers = register(client)
    client.patch("/api/v1/companies/current", json={"metier": "peinture"}, headers=headers)
    body = client.post("/api/v1/quotes/sample", headers=headers).json()
    # TVA conseillée du métier peinture (10 %) et postes de peinture.
    assert body["vatRate"] == 0.1
    labels = " ".join(line["label"].lower() for line in body["lines"])
    assert "peinture" in labels


def test_import_exemple_sans_metier_utilise_le_modele_generique(client):
    headers = register(client)
    body = client.post("/api/v1/quotes/sample", headers=headers).json()
    assert body["status"] == "brouillon"
    assert len(body["lines"]) >= 1


def test_import_exemple_respecte_le_quota_gratuit(client, monkeypatch):
    import app.api.v1.quotes as quotes_api
    from app.services.features import QuoteQuota

    # Simule un quota gratuit atteint : l'import doit être refusé comme une création.
    monkeypatch.setattr(
        quotes_api, "quote_quota", lambda *a, **k: QuoteQuota(used=3, limit=3)
    )
    headers = register(client)
    r = client.post("/api/v1/quotes/sample", headers=headers)
    assert r.status_code == 403

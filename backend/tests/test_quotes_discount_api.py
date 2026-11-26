"""Remises persistées via l'API quotes (le serveur recalcule tout)."""

from tests.conftest import register

BODY = {
    "clientName": "Client Remise",
    "vatRate": 0.2,
    "discountType": "percent",
    "discountValue": 10,
    "lines": [{"label": "Peinture", "quantity": 10, "unitPrice": 100, "unit": "m2"}],
}


def test_creation_avec_remise_persiste_et_restitue(client):
    headers = register(client)
    r = client.post("/api/v1/quotes", json=BODY, headers=headers)
    assert r.status_code == 201
    body = r.json()
    assert body["discountType"] == "percent"
    assert body["discountValue"] == 10
    assert body["status"] == "brouillon"

    # La remise survit au rechargement de la liste.
    quotes = client.get("/api/v1/quotes", headers=headers).json()
    assert quotes[0]["discountType"] == "percent"
    assert quotes[0]["discountValue"] == 10


def test_modification_retire_la_remise(client):
    headers = register(client)
    quote_id = client.post("/api/v1/quotes", json=BODY, headers=headers).json()["id"]
    sans_remise = {**BODY, "discountType": None, "discountValue": 0}
    r = client.patch(f"/api/v1/quotes/{quote_id}", json=sans_remise, headers=headers)
    assert r.status_code == 200
    assert r.json()["discountType"] is None


def test_type_de_remise_invalide_rejete(client):
    headers = register(client)
    r = client.post("/api/v1/quotes", json={**BODY, "discountType": "cadeau"}, headers=headers)
    assert r.status_code == 422


def test_remise_negative_rejetee(client):
    headers = register(client)
    r = client.post("/api/v1/quotes", json={**BODY, "discountValue": -5}, headers=headers)
    assert r.status_code == 422


def test_nom_client_round_trip_sans_doublon(client):
    headers = register(client)
    created = client.post(
        "/api/v1/quotes", json={**BODY, "clientName": "Chloé Marchand"}, headers=headers
    ).json()
    assert created["clientName"] == "Chloé Marchand"

    # Une modification ne doit pas dupliquer le nom de famille.
    updated = client.patch(
        f"/api/v1/quotes/{created['id']}",
        json={**BODY, "clientName": "Chloé Marchand"},
        headers=headers,
    ).json()
    assert updated["clientName"] == "Chloé Marchand"

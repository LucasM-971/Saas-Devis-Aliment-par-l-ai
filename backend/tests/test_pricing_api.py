"""Grille tarifaire : lecture et remplacement (Réglages › Catalogue)."""

from tests.conftest import register

ITEMS = [
    {"label": "Peinture murs (2 couches)", "unit": "m2", "unitPrice": 28},
    {"label": "Enduit de lissage", "unit": "m2", "unitPrice": 18},
]


def test_grille_vide_au_depart(client):
    headers = register(client)
    assert client.get("/api/v1/pricing/items", headers=headers).json() == []


def test_remplacement_de_la_grille(client):
    headers = register(client)
    r = client.put("/api/v1/pricing/items", json=ITEMS, headers=headers)
    assert r.status_code == 200
    labels = [i["label"] for i in r.json()]
    assert labels == ["Enduit de lissage", "Peinture murs (2 couches)"]  # tri alphabétique

    # Un second remplacement écrase la grille active.
    r2 = client.put(
        "/api/v1/pricing/items",
        json=[{"label": "Pose de parquet", "unit": "m2", "unitPrice": 35}],
        headers=headers,
    )
    assert [i["label"] for i in r2.json()] == ["Pose de parquet"]
    assert [i["label"] for i in client.get("/api/v1/pricing/items", headers=headers).json()] == [
        "Pose de parquet"
    ]


def test_lignes_vides_ignorees(client):
    headers = register(client)
    r = client.put(
        "/api/v1/pricing/items",
        json=[{"label": "   ", "unit": "m2", "unitPrice": 10}, ITEMS[0]],
        headers=headers,
    )
    assert len(r.json()) == 1

"""Import de devis : parsing heuristique (sans LLM) + endpoint /quotes/import."""

import io

import pytest

from app.services import quote_import as qi
from tests.conftest import register

# ─── Analyse des nombres (formats FR / EN / devises) ───────────────────────────


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("25", 25.0),
        ("25,00", 25.0),
        ("25.00", 25.0),
        ("1 234,56", 1234.56),
        ("1.234,56", 1234.56),
        ("1,234.56", 1234.56),
        ("1 234,00 €", 1234.0),
        ("50 €", 50.0),
        ("", None),
        ("abc", None),
        ("20%", None),  # pourcentage : jamais un montant
    ],
)
def test_to_number(raw, expected):
    if expected is None and raw == "20%":
        # % exclu au niveau cellule
        assert not qi._looks_numeric(raw)
    else:
        assert qi._to_number(raw) == expected


# ─── Parsing heuristique d'un tableau (rendu façon DOCX : cellules « | ») ───────

TABLE_TEXT = """Devis n° 2026-0007
Client : Jean Dupont
jean.dupont@example.fr
TVA : 10 %

Désignation | Unité | Qté | P.U. HT | Total HT
Peinture murs et plafond | m² | 50 | 25,00 | 1 250,00
Pose de parquet | m² | 30 | 45,50 | 1 365,00
Forfait déplacement | forfait | 1 | 80,00 | 80,00
Sous-total HT | | | | 2 695,00
TVA 10% | | | | 269,50
Total TTC | | | | 2 964,50
"""


def test_heuristique_extrait_les_postes():
    draft = qi.parse_draft(TABLE_TEXT, use_llm=False)
    assert [l.label for l in draft.lines] == [
        "Peinture murs et plafond",
        "Pose de parquet",
        "Forfait déplacement",
    ]


def test_heuristique_quantites_prix_et_unites():
    lines = qi.parse_draft(TABLE_TEXT, use_llm=False).lines
    assert (lines[0].quantity, lines[0].unit_price, lines[0].unit) == (50.0, 25.0, "m2")
    assert (lines[1].quantity, lines[1].unit_price, lines[1].unit) == (30.0, 45.5, "m2")
    assert (lines[2].quantity, lines[2].unit_price, lines[2].unit) == (1.0, 80.0, "flat")


def test_heuristique_ignore_les_lignes_de_synthese():
    labels = [l.label for l in qi.parse_draft(TABLE_TEXT, use_llm=False).lines]
    assert not any("total" in lbl.lower() or "tva" in lbl.lower() for lbl in labels)


def test_heuristique_meta_client_email_tva():
    draft = qi.parse_draft(TABLE_TEXT, use_llm=False)
    assert draft.client_name == "Jean Dupont"
    assert draft.client_email == "jean.dupont@example.fr"
    assert draft.vat_rate == 0.1


def test_heuristique_format_inline_simple_espace():
    # Ligne sans séparateur de colonnes : nombres au fil du texte.
    draft = qi.parse_draft("Nettoyage fin de chantier 3 120,00", use_llm=False)
    assert len(draft.lines) == 1
    assert draft.lines[0].quantity == 3.0
    assert draft.lines[0].unit_price == 120.0


def test_ligne_sans_prix_ecartee():
    assert qi.parse_draft("Simple commentaire sans chiffre", use_llm=False).lines == []


# ─── Endpoint /api/v1/quotes/import ────────────────────────────────────────────


def _upload(client, headers, filename, content, mime="text/plain"):
    return client.post(
        "/api/v1/quotes/import",
        files={"file": (filename, content, mime)},
        headers=headers,
    )


def test_import_txt_renvoie_un_brouillon(client):
    headers = register(client)
    r = _upload(client, headers, "devis.txt", TABLE_TEXT.encode("utf-8"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["parsed"] is True
    assert body["clientName"] == "Jean Dupont"
    assert body["vatRate"] == 0.1
    assert len(body["lines"]) == 3
    assert body["lines"][0]["unit"] == "m2"
    # camelCase attendu côté front.
    assert "unitPrice" in body["lines"][0]


def test_import_docx(client):
    docx = pytest.importorskip("docx")
    headers = register(client)

    document = docx.Document()
    document.add_paragraph("Client : Marie Martin")
    table = document.add_table(rows=1, cols=4)
    table.rows[0].cells[0].text = "Désignation"
    table.rows[0].cells[1].text = "Qté"
    table.rows[0].cells[2].text = "P.U."
    table.rows[0].cells[3].text = "Total"
    row = table.add_row().cells
    row[0].text = "Isolation combles"
    row[1].text = "40"
    row[2].text = "18,00"
    row[3].text = "720,00"
    buf = io.BytesIO()
    document.save(buf)

    r = _upload(
        client, headers, "devis.docx", buf.getvalue(),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["clientName"] == "Marie Martin"
    assert len(body["lines"]) == 1
    assert body["lines"][0]["label"] == "Isolation combles"
    assert body["lines"][0]["quantity"] == 40
    assert body["lines"][0]["unitPrice"] == 18.0


def test_import_fichier_vide_rejete(client):
    headers = register(client)
    r = _upload(client, headers, "vide.txt", b"")
    assert r.status_code == 400


def test_import_texte_sans_poste_reste_ouvert(client):
    headers = register(client)
    r = _upload(client, headers, "note.txt", "Bonjour, merci pour votre demande.".encode())
    assert r.status_code == 200
    body = r.json()
    assert body["parsed"] is False
    assert body["lines"] == []


def test_import_exige_authentification(client):
    # Sans en-têtes d'authentification, l'import est refusé.
    r = client.post("/api/v1/quotes/import", files={"file": ("x.txt", b"x", "text/plain")})
    assert r.status_code in (401, 403)

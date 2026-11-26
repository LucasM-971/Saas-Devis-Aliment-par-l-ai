from fastapi.testclient import TestClient

from app.llm.client import MAX_BUTTON_LEN, clean_buttons
from app.llm.prompts import MAX_BUTTONS, build_system_prompt
from app.llm.schemas import BlocItem, QAItem
from app.main import app

client = TestClient(app)


# ── clean_buttons : nettoyage des boutons renvoyés par le modèle ──────────────


def test_clean_buttons_dedupe_insensible_a_la_casse():
    assert clean_buttons(["Oui", "oui", "OUI"]) == ["Oui"]


def test_clean_buttons_retire_vides_et_espaces():
    assert clean_buttons(["  ", "", "  Devis  "]) == ["Devis"]


def test_clean_buttons_tronque_les_libelles_trop_longs():
    long_label = "x" * 100
    assert len(clean_buttons([long_label])[0]) == MAX_BUTTON_LEN


def test_clean_buttons_limite_le_nombre():
    many = [f"Bouton {i}" for i in range(10)]
    assert len(clean_buttons(many)) == MAX_BUTTONS


# ── build_system_prompt : ancrage sur la base de connaissances ────────────────


def test_prompt_inclut_nom_entreprise_et_qas():
    prompt = build_system_prompt(
        "Atelier Dupont",
        [QAItem(question="Le devis est-il gratuit ?", answer="Oui, c'est gratuit.")],
        [],
        None,
    )
    assert "Atelier Dupont" in prompt
    assert "Le devis est-il gratuit ?" in prompt
    assert "Oui, c'est gratuit." in prompt


def test_prompt_ajoute_la_regle_prix_si_tarif_fourni():
    avec = build_system_prompt("X", [], [], "45")
    sans = build_system_prompt("X", [], [], None)
    assert "45 €/m²" in avec
    assert "m²" not in sans or "Tarif de base" not in sans


def test_prompt_reprend_les_boutons_des_blocs():
    prompt = build_system_prompt(
        "X",
        [],
        [BlocItem(trigger="je veux un devis", text="Quel projet ?", buttons=["Neuf", "Rénovation"])],
        None,
    )
    assert "Neuf" in prompt and "Rénovation" in prompt


# ── Endpoint : validation du corps (les parcours complets sont dans test_chat_llm) ──


def test_message_valide_le_corps():
    # message et company_public_id requis → 422 si absents.
    assert client.post("/api/v1/chat/message", json={}).status_code == 422
    # La base de connaissances ne peut plus être fournie dans le corps :
    # sans public_id, la requête est rejetée avant tout appel LLM.
    assert (
        client.post("/api/v1/chat/message", json={"message": "Bonjour"}).status_code == 422
    )

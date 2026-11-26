"""Démo du flux complet : chat → devis brouillon → édition → envoi PDF.

Usage (depuis backend/) : python -m scripts.demo_e2e
LLM et PDF simulés si ANTHROPIC_API_KEY ou WeasyPrint absents.
"""

import uuid
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.llm import client as llm_client
from app.llm import extractor
from app.llm.schemas import ChatResponse, ExtractedCustomer, ExtractedLineItem, ExtractionResult
from app.main import app
from app.models import Company, Conversation, PriceItem, Quote

client = TestClient(app)

DEMO_EMAIL = "lucas@atelier-dupont.fr"
DEMO_PASSWORD = "motdepasse"


def _stub_llm(item_id: int) -> None:
    """Remplace les appels LLM par des sorties plausibles (démo sans clé API)."""

    def fake_reply(**kwargs) -> ChatResponse:
        return ChatResponse(
            answer="Très bien ! Quelle surface et dans quel code postal ?", buttons=[]
        )

    def fake_extract(**kwargs) -> ExtractionResult:
        return ExtractionResult(
            service_slug="peinture",
            postal_code="75011",
            customer=ExtractedCustomer(
                first_name="Chloé", last_name="Marchand", email="chloe.marchand@example.fr"
            ),
            items=[ExtractedLineItem(price_item_id=str(item_id), quantity=42)],
            notes="Repeindre le séjour, murs en bon état.",
        )

    llm_client.generate_reply = fake_reply
    extractor.extract = fake_extract


def _stub_pdf_if_needed() -> bool:
    """Simule le rendu PDF si WeasyPrint (deps système) est absent."""
    try:
        import weasyprint  # noqa: F401

        return True
    except Exception:
        import app.api.v1.quotes as quotes_api

        quotes_api.render_quote_pdf = lambda quote, company: b"%PDF-demo"
        return False


def run() -> None:
    db = SessionLocal()
    try:
        dupont = db.scalar(select(Company).where(Company.slug == "atelier-dupont"))
        if dupont is None:
            raise SystemExit("Base non seedée : lancez d'abord `python -m scripts.seed`.")
        item = db.scalar(
            select(PriceItem).where(
                PriceItem.company_id == dupont.id,
                PriceItem.label == "Peinture murs (2 couches)",
                PriceItem.is_active.is_(True),
            )
        )
        public_id = dupont.public_id
    finally:
        db.close()

    if not settings.anthropic_api_key:
        print("• Pas de clé Anthropic : LLM simulé (le reste du flux est réel).")
        _stub_llm(item.id)
    else:
        print("• Clé Anthropic détectée : LLM réel.")
        _ = item  # le catalogue réel guide l'extraction
    pdf_real = _stub_pdf_if_needed()
    print(f"• Rendu PDF : {'WeasyPrint réel' if pdf_real else 'simulé (WeasyPrint absent)'}")

    # 0. Le prospect discute : chaque tour est enregistré
    session_uid = str(uuid.uuid4())
    for message in ["Repeindre mon séjour.", "42 m², à Paris 11e."]:
        r = client.post(
            "/api/v1/chat/message",
            json={"company_public_id": public_id, "message": message, "session_uid": session_uid},
        )
        r.raise_for_status()
    db = SessionLocal()
    try:
        conversation = db.scalar(
            select(Conversation).where(Conversation.session_uid == session_uid)
        )
        assert conversation is not None and conversation.status == "open"
        assert len(conversation.transcript) == 4  # 2 tours user + 2 réponses bot
        assert conversation.last_activity_at is not None
    finally:
        db.close()
    print("✓ 0. Conversation persistée tour par tour (open, transcript horodaté)")

    # 1. Le prospect demande son devis — DEUX FOIS (double-clic) : un seul brouillon.
    payload = {
        "company_public_id": public_id,
        "message": "Je veux repeindre 42 m² de murs à Paris 11e. Chloé Marchand, chloe.marchand@example.fr",
        "session_uid": session_uid,
    }
    resp = client.post("/api/v1/chat/quote", json=payload)
    resp.raise_for_status()
    body = resp.json()
    assert body["outcome"] == "quote", f"Attendu un devis, obtenu : {body}"
    reference = body["quote"]["reference"]
    second = client.post("/api/v1/chat/quote", json=payload).json()
    assert second["quote"]["reference"] == reference, "double appel = même brouillon"
    print(f"✓ 1. Chat → devis estimatif {reference} ({body['quote']['total']} € TTC), idempotent")

    # 2. L'artisan se connecte et retrouve le brouillon.
    token = client.post(
        "/api/v1/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    quotes = client.get("/api/v1/quotes", headers=headers).json()
    draft = next(q for q in quotes if q["reference"] == reference)
    assert draft["status"] == "brouillon"
    print(f"✓ 2. Brouillon visible dans le dashboard (statut : {draft['status']})")

    # 3. Il l'édite dans l'éditeur : réordonne, ajoute une ligne, une remise et des conditions.
    lines = [
        {"label": "Préparation et protection des surfaces", "unit": "flat", "quantity": 1, "unitPrice": 250},
        *[
            {"label": l["label"], "unit": l["unit"], "quantity": l["quantity"], "unitPrice": l["unitPrice"]}
            for l in draft["lines"]
        ],
    ]
    updated = client.patch(
        f"/api/v1/quotes/{draft['id']}",
        json={
            "clientName": draft["clientName"],
            "clientEmail": draft["clientEmail"],
            "vatRate": 0.1,
            "discountType": "percent",
            "discountValue": 5,
            "notes": "Acompte de 30 % à la commande.",
            "lines": lines,
        },
        headers=headers,
    ).json()
    print(
        f"✓ 3. Édition (ligne ajoutée en tête, remise 5 %, conditions) — "
        f"{len(updated['lines'])} lignes, remise {updated['discountValue']} %"
    )

    # 4. Devis édité enregistré, toujours brouillon et protégé du chat
    db = SessionLocal()
    try:
        quote = db.scalar(select(Quote).where(Quote.reference == reference))
        assert quote is not None and quote.status == "draft"
        assert quote.discount_type == "percent" and quote.discount_value == Decimal("5.00")
        assert quote.lines[0].label == "Préparation et protection des surfaces"
        assert quote.artisan_edited is True
        quote_id, total = quote.id, quote.total
    finally:
        db.close()
    replay = client.post("/api/v1/chat/quote", json=payload).json()
    assert replay["quote"]["reference"] == reference
    db = SessionLocal()
    try:
        untouched = db.get(Quote, quote_id)
        assert untouched.lines[0].label == "Préparation et protection des surfaces"
    finally:
        db.close()
    print(f"✓ 4. Persisté en DB : {reference}, brouillon retouché jamais écrasé par le chat")

    # 5. L'artisan valide puis ENVOIE : e-mail (console) + PDF stocké + statuts.
    client.patch(
        f"/api/v1/quotes/{quote_id}/status", json={"status": "pret"}, headers=headers
    ).raise_for_status()
    sent = client.post(f"/api/v1/quotes/{quote_id}/send", headers=headers)
    sent.raise_for_status()
    assert sent.json()["status"] == "envoye" and sent.json()["emailStatus"] == "sent"
    db = SessionLocal()
    try:
        quote = db.get(Quote, quote_id)
        assert quote.sent_pdf is not None and quote.sent_at is not None
        conversation = db.scalar(
            select(Conversation).where(Conversation.session_uid == session_uid)
        )
        assert conversation.status == "completed"
    finally:
        db.close()
    print(f"✓ 5. Envoyé : e-mail parti (console), PDF figé ({'réel' if pdf_real else 'simulé'}), "
          "conversation complétée")
    print("\nDémo terminée : chat persisté → brouillon idempotent → édition → envoi PDF. ✅")
    print("Métriques : python -m scripts.pilot_metrics")


if __name__ == "__main__":
    run()

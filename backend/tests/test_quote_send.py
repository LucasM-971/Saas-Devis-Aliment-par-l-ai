"""Envoi du devis : statuts, PDF stocké (rendu mocké, e-mail en console)."""

import smtplib
from decimal import Decimal

from sqlalchemy import select

import app.api.v1.quotes as quotes_api
from app.models import Quote
from tests.conftest import register

BODY = {
    "clientName": "Alice Martin",
    "clientEmail": "alice@example.fr",
    "vatRate": 0.2,
    "lines": [{"label": "Peinture murs", "quantity": 24, "unitPrice": 45, "unit": "m2"}],
}

FAKE_PDF = b"%PDF-1.4 fake"


def _quote_pret(client, headers) -> str:
    quote_id = client.post("/api/v1/quotes", json=BODY, headers=headers).json()["id"]
    r = client.patch(f"/api/v1/quotes/{quote_id}/status", json={"status": "pret"}, headers=headers)
    assert r.status_code == 200
    return quote_id


def test_envoi_reussi_stocke_le_pdf_et_les_statuts(client, db_sessionmaker, monkeypatch):
    monkeypatch.setattr(quotes_api, "render_quote_pdf", lambda quote, company: FAKE_PDF)
    headers = register(client)
    quote_id = _quote_pret(client, headers)

    r = client.post(f"/api/v1/quotes/{quote_id}/send", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "envoye"
    assert body["emailStatus"] == "sent"

    check = db_sessionmaker()
    quote = check.get(Quote, int(quote_id))
    assert quote.sent_pdf == FAKE_PDF  # le document réellement parti est figé
    assert quote.sent_at is not None
    check.close()


def test_echec_smtp_ne_marque_jamais_envoye(client, db_sessionmaker, monkeypatch):
    monkeypatch.setattr(quotes_api, "render_quote_pdf", lambda quote, company: FAKE_PDF)
    headers = register(client)
    quote_id = _quote_pret(client, headers)

    def boom(quote, company, pdf):
        raise smtplib.SMTPException("connexion refusée")

    monkeypatch.setattr(quotes_api, "send_quote_email", boom)
    r = client.post(f"/api/v1/quotes/{quote_id}/send", headers=headers)
    assert r.status_code == 502

    # Échec tracé, statut du devis INCHANGÉ : jamais « envoyé » non reçu.
    check = db_sessionmaker()
    quote = check.get(Quote, int(quote_id))
    assert quote.email_status == "failed"
    assert quote.status == "validated"
    assert quote.sent_pdf is None
    check.close()

    # Un nouveau clic réessaie : l'envoi redevenu possible aboutit.
    monkeypatch.setattr(
        quotes_api, "send_quote_email", lambda quote, company, pdf: None
    )
    retry = client.post(f"/api/v1/quotes/{quote_id}/send", headers=headers)
    assert retry.status_code == 200
    assert retry.json()["emailStatus"] == "sent"


def test_pdf_indisponible_renvoie_503(client, monkeypatch):
    from app.services.quote_pdf import PdfUnavailable

    def boom(quote, company):
        raise PdfUnavailable("pango absent")

    monkeypatch.setattr(quotes_api, "render_quote_pdf", boom)
    headers = register(client)
    quote_id = _quote_pret(client, headers)

    r = client.post(f"/api/v1/quotes/{quote_id}/send", headers=headers)
    assert r.status_code == 503


def test_retouche_artisan_posee_par_patch(client, db_sessionmaker):
    headers = register(client)
    quote_id = client.post("/api/v1/quotes", json=BODY, headers=headers).json()["id"]

    check = db_sessionmaker()
    assert check.get(Quote, int(quote_id)).artisan_edited is False
    check.close()

    r = client.patch(f"/api/v1/quotes/{quote_id}", json=BODY, headers=headers)
    assert r.status_code == 200

    check = db_sessionmaker()
    assert check.get(Quote, int(quote_id)).artisan_edited is True
    check.close()

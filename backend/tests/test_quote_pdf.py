"""Rendu du devis ; le PDF binaire n'est testé que si WeasyPrint est installé."""

from decimal import Decimal

import pytest

from app.models import Company, Quote, QuoteLine
from app.services.quote_pdf import render_quote_html, render_quote_pdf


def _quote(**kwargs) -> Quote:
    quote = Quote(
        reference="DEV-2026-0001",
        customer_first_name="Alice",
        customer_last_name="Martin",
        customer_email="alice@example.fr",
        subtotal=Decimal("1080.00"),
        tax_rate=Decimal("20.00"),
        total=Decimal("1296.00"),
        currency="EUR",
        **kwargs,
    )
    quote.lines = [
        QuoteLine(
            label="Peinture murs",
            unit="m2",
            quantity=Decimal("24"),
            unit_price=Decimal("45.00"),
            line_total=Decimal("1080.00"),
            position=0,
        )
    ]
    return quote


def _company(**kwargs) -> Company:
    kwargs.setdefault("name", "Atelier Dupont")
    return Company(public_id="x", slug="atelier", **kwargs)


def test_mentions_presentes_quand_renseignees():
    company = _company(
        siret="123 456 789 00012",
        legal_form="SASU",
        share_capital="5 000 €",
        vat_number="FR12345678901",
        insurance_name="AXA Pro BTP",
        insurance_contract="DEC-42",
        mediator_name="CM2C",
        mediator_url="https://cm2c.net",
    )
    html = render_quote_html(_quote(), company)
    assert "SIRET : 123 456 789 00012" in html
    assert "SASU" in html and "5 000 €" in html
    assert "FR12345678901" in html
    assert "Assurance décennale : AXA Pro BTP, contrat n° DEC-42" in html
    assert "Médiateur de la consommation : CM2C" in html
    assert "TVA (20 %)" in html
    assert "Total TTC" in html and "1296,00 €" in html


def test_mentions_absentes_quand_non_renseignees():
    html = render_quote_html(_quote(), _company())
    assert "SIRET" not in html
    assert "Assurance décennale" not in html
    assert "Médiateur" not in html
    # Le document reste valide et complet côté chiffrage.
    assert "Devis DEV-2026-0001" in html
    assert "Devis valable 30 jours" in html


def test_franchise_293b_remplace_la_tva():
    quote = _quote()
    quote.tax_rate = Decimal("0")
    quote.total = Decimal("1080.00")
    html = render_quote_html(quote, _company(vat_exempt=True))
    assert "TVA non applicable, art. 293 B du CGI" in html
    assert "TVA (" not in html  # pas de ligne de TVA en franchise


def test_donnees_client_echappees():
    quote = _quote()
    quote.lines[0].label = "<script>alert('x')</script>"
    html = render_quote_html(quote, _company(name="A & B <Bâtiment>"))
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "A &amp; B &lt;Bâtiment&gt;" in html


def test_remise_affichee():
    quote = _quote()
    quote.discount_type = "percent"
    quote.discount_value = Decimal("10")
    quote.total = Decimal("1166.40")  # (1080 − 10 %) × 1,20
    html = render_quote_html(quote, _company())
    assert "Remise (10 %)" in html
    assert "Net HT" in html


def test_rendu_pdf_binaire():
    pytest.importorskip("weasyprint", reason="WeasyPrint absent (deps système pango/cairo)")
    pdf = render_quote_pdf(_quote(), _company(siret="123"))
    assert pdf.startswith(b"%PDF")

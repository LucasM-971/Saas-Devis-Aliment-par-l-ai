"""E-mail d'envoi du devis : message court + PDF joint."""

import html as html_lib
from decimal import Decimal

from app.email.sender import render_template, send_email
from app.models import Company, Quote


def _eur(value: Decimal | float) -> str:
    return f"{Decimal(value):.2f}".replace(".", ",") + " €"


def send_quote_email(quote: Quote, company: Company, pdf: bytes) -> None:
    assert quote.customer_email, "e-mail client requis"
    client_name = " ".join(
        p for p in [quote.customer_first_name, quote.customer_last_name] if p
    ) or "client"

    notes_block = ""
    if quote.notes:
        notes_block = (
            '<p style="margin:16px 0 0;padding:12px;background:#f8fafc;border-radius:8px;'
            f'color:#475569;font-size:13px;">{html_lib.escape(quote.notes)}</p>'
        )

    html = render_template(
        "quote_to_client.html",
        company_name=html_lib.escape(company.name),
        client_name=html_lib.escape(client_name),
        reference=quote.reference,
        total=_eur(quote.total),
        notes_block=notes_block,
    )
    send_email(
        to=quote.customer_email,
        subject=f"Votre devis {quote.reference} — {company.name}",
        html=html,
        attachments=[(f"devis-{quote.reference}.pdf", pdf, "application/pdf")],
    )

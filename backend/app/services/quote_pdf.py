"""Document devis : rendu HTML unique + PDF (WeasyPrint).

C'est LE document contractuel envoyé au client — l'e-mail n'est qu'un message
d'accompagnement. Une seule source de rendu (décision de revue) : si un montant
apparaissait à la fois dans le corps du mail et dans le PDF, ils divergeraient
un jour.

Mentions légales françaises : chaque bloc n'apparaît que si les champs
correspondants sont renseignés sur `Company` ; la franchise en base de TVA
(art. 293 B du CGI) remplace la ligne de TVA par la mention obligatoire.
"""

import html as html_lib
from decimal import Decimal

from app.models import Company, Quote
from app.services.pricing_engine import compute_discount


class PdfUnavailable(RuntimeError):
    """WeasyPrint (ou ses dépendances système pango/cairo) est absent."""


_UNIT_LABELS = {"m2": "m²", "ml": "ml", "m3": "m³", "unit": "u", "hour": "h", "flat": "forfait"}

_CSS = """
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #0f172a; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .muted { color: #64748b; }
  .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
  .identity { font-size: 10px; line-height: 1.5; }
  .block-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
                 color: #64748b; margin: 18px 0 6px; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.lines th { text-align: left; font-size: 10px; text-transform: uppercase;
                   color: #64748b; padding: 6px 8px; border-bottom: 1px solid #cbd5e1; }
  table.lines td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
  td.num, th.num { text-align: right; }
  table.totals { margin-top: 12px; margin-left: auto; border-collapse: collapse; }
  table.totals td { padding: 3px 8px; }
  table.totals tr.grand td { font-weight: bold; font-size: 13px;
                             border-top: 1px solid #0f172a; padding-top: 6px; }
  .legal { margin-top: 26px; font-size: 9px; color: #64748b; line-height: 1.6; }
  .signature { margin-top: 30px; border: 1px solid #cbd5e1; border-radius: 4px;
               padding: 10px 12px; width: 60%; }
  .signature .line { margin-top: 28px; border-top: 1px dotted #94a3b8;
                     padding-top: 4px; font-size: 9px; color: #64748b; }
"""


def _esc(value: object) -> str:
    return html_lib.escape(str(value))


def _eur(value: Decimal | float) -> str:
    return f"{Decimal(value):.2f}".replace(".", ",") + " €"


# Nombre « propre » : sans zéros de traîne (20.00 → 20 ; 5.50 → 5,5).
# Le format :g est piégeux avec Decimal (notation exponentielle) — on nettoie
# explicitement la forme décimale.
def _fmt_qty(value: Decimal) -> str:
    text = f"{Decimal(value):f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text.replace(".", ",")


# Lignes d'identité de l'émetteur : seules les informations renseignées sortent.
def _identity_lines(company: Company) -> list[str]:
    lines: list[str] = []
    legal_bits = [b for b in [company.legal_form, company.share_capital] if b]
    if legal_bits:
        lines.append(" — capital ".join(_esc(b) for b in legal_bits))
    if company.address:
        lines.append(_esc(company.address))
    contact_bits = [b for b in [company.contact_phone, company.contact_email] if b]
    if contact_bits:
        lines.append(" · ".join(_esc(b) for b in contact_bits))
    if company.siret:
        lines.append(f"SIRET : {_esc(company.siret)}")
    if company.rcs_rm:
        lines.append(_esc(company.rcs_rm))
    if company.ape_code:
        lines.append(f"Code APE : {_esc(company.ape_code)}")
    if company.vat_number:
        lines.append(f"TVA intracommunautaire : {_esc(company.vat_number)}")
    return lines


def _lines_rows(quote: Quote) -> str:
    return "".join(
        "<tr>"
        f"<td>{_esc(line.label)}</td>"
        f"<td class='num'>{_fmt_qty(line.quantity)}</td>"
        f"<td>{_UNIT_LABELS.get(line.unit, _esc(line.unit))}</td>"
        f"<td class='num'>{_eur(line.unit_price)}</td>"
        f"<td class='num'>{_eur(line.line_total)}</td>"
        "</tr>"
        for line in sorted(quote.lines, key=lambda x: x.position)
    )


def _totals_rows(quote: Quote, company: Company) -> str:
    discount = compute_discount(
        quote.subtotal, quote.discount_type, quote.discount_value or Decimal(0)
    )
    net = quote.subtotal - discount
    rows = [f"<tr><td>Sous-total HT</td><td class='num'>{_eur(quote.subtotal)}</td></tr>"]
    if discount > 0:
        label = "Remise"
        if quote.discount_type == "percent":
            label += f" ({_fmt_qty(quote.discount_value)} %)"
        rows.append(f"<tr><td>{label}</td><td class='num'>−{_eur(discount)}</td></tr>")
        rows.append(f"<tr><td>Net HT</td><td class='num'>{_eur(net)}</td></tr>")
    if company.vat_exempt:
        # Mention obligatoire de la franchise en base (art. 293 B du CGI).
        rows.append(
            "<tr><td colspan='2' class='muted'>TVA non applicable, "
            "art. 293 B du CGI</td></tr>"
        )
        rows.append(f"<tr class='grand'><td>Total</td><td class='num'>{_eur(quote.total)}</td></tr>")
    else:
        vat_amount = quote.total - net
        rows.append(
            f"<tr><td>TVA ({_fmt_qty(quote.tax_rate)} %)</td>"
            f"<td class='num'>{_eur(vat_amount)}</td></tr>"
        )
        rows.append(
            f"<tr class='grand'><td>Total TTC</td><td class='num'>{_eur(quote.total)}</td></tr>"
        )
    return "".join(rows)


# Mentions de bas de page : assurance décennale (obligatoire dans le bâtiment,
# loi n° 2014-344) et médiateur de la consommation (B2C, art. L612-1).
def _legal_mentions(company: Company) -> str:
    mentions: list[str] = []
    if company.insurance_name:
        insurance = f"Assurance décennale : {_esc(company.insurance_name)}"
        if company.insurance_contract:
            insurance += f", contrat n° {_esc(company.insurance_contract)}"
        if company.insurance_coverage:
            insurance += f" — couverture : {_esc(company.insurance_coverage)}"
        mentions.append(insurance)
    if company.mediator_name:
        mediator = f"Médiateur de la consommation : {_esc(company.mediator_name)}"
        if company.mediator_url:
            mediator += f" ({_esc(company.mediator_url)})"
        mentions.append(mediator)
    mentions.append("Devis valable 30 jours à compter de sa date d'émission.")
    return "<br/>".join(mentions)


def render_quote_html(quote: Quote, company: Company) -> str:
    client_name = " ".join(
        p for p in [quote.customer_first_name, quote.customer_last_name] if p
    ) or "Client"
    client_bits = [_esc(client_name)]
    if quote.customer_email:
        client_bits.append(_esc(quote.customer_email))
    if quote.customer_phone:
        client_bits.append(_esc(quote.customer_phone))
    identity = "<br/>".join(_identity_lines(company))
    issued = quote.created_at.strftime("%d/%m/%Y") if quote.created_at else ""
    notes = (
        f"<div class='block-title'>Notes</div><div>{_esc(quote.notes)}</div>"
        if quote.notes
        else ""
    )
    return f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><style>{_CSS}</style></head><body>
  <div class="header">
    <div>
      <h1>{_esc(company.name)}</h1>
      <div class="identity muted">{identity}</div>
    </div>
    <div style="text-align:right">
      <h1>Devis {_esc(quote.reference)}</h1>
      <div class="muted">Émis le {issued}</div>
    </div>
  </div>

  <div class="block-title">Adressé à</div>
  <div>{" · ".join(client_bits)}</div>

  <div class="block-title">Détail des prestations</div>
  <table class="lines">
    <tr><th>Désignation</th><th class="num">Qté</th><th>Unité</th>
        <th class="num">PU HT</th><th class="num">Total HT</th></tr>
    {_lines_rows(quote)}
  </table>

  <table class="totals">{_totals_rows(quote, company)}</table>
  {notes}

  <div class="signature">
    <div>Bon pour accord — date et signature du client :</div>
    <div class="line">Fait le ____ / ____ / ________</div>
  </div>

  <div class="legal">{_legal_mentions(company)}</div>
</body></html>"""


def render_quote_pdf(quote: Quote, company: Company) -> bytes:
    try:
        from weasyprint import HTML  # import paresseux : dépendances système lourdes
    except Exception as exc:  # ImportError ou OSError (pango/cairo absents)
        raise PdfUnavailable(str(exc)) from exc
    return HTML(string=render_quote_html(quote, company)).write_pdf()

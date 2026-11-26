from decimal import Decimal

from app.services.pricing_engine import LineInput, compute_line_total, compute_quote


def line(price: str, qty: str) -> LineInput:
    return LineInput(label="x", unit="unit", unit_price=Decimal(price), quantity=Decimal(qty))


def test_line_total():
    assert compute_line_total(Decimal("45"), Decimal("24")) == Decimal("1080.00")


def test_line_total_rounds_to_cent():
    assert compute_line_total(Decimal("0.1"), Decimal("3")) == Decimal("0.30")


def test_compute_quote_totals():
    quote = compute_quote([line("45", "24"), line("320", "1")], tax_rate=Decimal("20"))
    assert quote.subtotal == Decimal("1400.00")
    assert quote.tax_amount == Decimal("280.00")
    assert quote.total == Decimal("1680.00")
    assert len(quote.lines) == 2


def test_empty_quote():
    quote = compute_quote([], tax_rate=Decimal("20"))
    assert quote.subtotal == Decimal("0.00")
    assert quote.total == Decimal("0.00")


def test_reduced_tax_rate():
    quote = compute_quote([line("200", "1")], tax_rate=Decimal("10"))
    assert quote.tax_amount == Decimal("20.00")
    assert quote.total == Decimal("220.00")


# ─── Remises ──────────────────────────────────────────────────────────────────


def test_remise_pourcentage():
    quote = compute_quote(
        [line("100", "10")], tax_rate=Decimal("20"),
        discount_type="percent", discount_value=Decimal("10"),
    )
    assert quote.subtotal == Decimal("1000.00")
    assert quote.discount_amount == Decimal("100.00")
    assert quote.net_subtotal == Decimal("900.00")
    # La TVA s'applique sur le HT net (après remise).
    assert quote.tax_amount == Decimal("180.00")
    assert quote.total == Decimal("1080.00")


def test_remise_montant():
    quote = compute_quote(
        [line("100", "10")], tax_rate=Decimal("20"),
        discount_type="amount", discount_value=Decimal("250"),
    )
    assert quote.discount_amount == Decimal("250.00")
    assert quote.net_subtotal == Decimal("750.00")
    assert quote.total == Decimal("900.00")


def test_remise_bornee_au_sous_total():
    # Une remise supérieure au HT ne rend jamais le devis négatif.
    quote = compute_quote(
        [line("100", "1")], tax_rate=Decimal("20"),
        discount_type="amount", discount_value=Decimal("500"),
    )
    assert quote.discount_amount == Decimal("100.00")
    assert quote.net_subtotal == Decimal("0.00")
    assert quote.total == Decimal("0.00")


def test_remise_pourcentage_arrondie_au_centime():
    quote = compute_quote(
        [line("99.99", "1")], tax_rate=Decimal("20"),
        discount_type="percent", discount_value=Decimal("33"),
    )
    # 33 % de 99,99 = 32,9967 → 33,00
    assert quote.discount_amount == Decimal("33.00")
    assert quote.net_subtotal == Decimal("66.99")


def test_remise_nulle_ou_type_inconnu_ignoree():
    for dtype, value in [(None, Decimal("10")), ("percent", Decimal("0")), ("cadeau", Decimal("10"))]:
        quote = compute_quote(
            [line("100", "1")], tax_rate=Decimal("20"),
            discount_type=dtype, discount_value=value,
        )
        assert quote.discount_amount == Decimal("0.00")
        assert quote.total == Decimal("120.00")


def test_sans_remise_le_ht_net_egale_le_ht():
    quote = compute_quote([line("45", "24")], tax_rate=Decimal("20"))
    assert quote.discount_amount == Decimal("0.00")
    assert quote.net_subtotal == quote.subtotal

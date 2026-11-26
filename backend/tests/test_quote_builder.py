from decimal import Decimal

from app.services.quote_builder import ExtractedItem, PriceItemRef, build_quote

GRILLE = [
    PriceItemRef(id=1, label="Peinture murs", unit="m2", unit_price=Decimal("45")),
    PriceItemRef(id=2, label="Préparation des surfaces", unit="flat", unit_price=Decimal("320")),
]
SERVICES = ["peinture", "carrelage"]
ZONES = ["75016", "75015"]


def build(**overrides):
    base = dict(
        service_slug="peinture",
        postal_code="75016",
        items=[ExtractedItem(1, Decimal("24")), ExtractedItem(2, Decimal("1"))],
        grille=GRILLE,
        supported_services=SERVICES,
        served_postal_codes=ZONES,
        tax_rate=Decimal("20"),
    )
    base.update(overrides)
    return build_quote(**base)


def test_devis_chiffre_depuis_la_grille():
    result = build()
    assert result.lead_reason is None
    assert result.computation is not None
    # 45*24 + 320*1 = 1400 HT, TVA 20 %, 1680 TTC.
    assert result.computation.subtotal == Decimal("1400.00")
    assert result.computation.total == Decimal("1680.00")
    assert result.price_item_ids == (1, 2)


def test_postes_inconnus_ignores():
    # Le LLM ne peut pas introduire un poste hors grille.
    result = build(items=[ExtractedItem(1, Decimal("10")), ExtractedItem(999, Decimal("5"))])
    assert result.price_item_ids == (1,)
    assert result.computation.subtotal == Decimal("450.00")


def test_quantite_non_positive_ignoree():
    result = build(items=[ExtractedItem(1, Decimal("0")), ExtractedItem(2, Decimal("1"))])
    assert result.price_item_ids == (2,)


def test_hors_zone_donne_un_lead():
    result = build(postal_code="13001")
    assert result.computation is None
    assert result.lead_reason == "out_of_zone"


def test_service_non_supporte_donne_un_lead():
    result = build(service_slug="plomberie")
    assert result.computation is None
    assert result.lead_reason == "unsupported_service"


def test_aucun_poste_valide_donne_incomplete():
    result = build(items=[ExtractedItem(999, Decimal("5"))])
    assert result.computation is None
    assert result.lead_reason == "incomplete"

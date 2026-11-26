"""TVA : conversion ratio → pourcentage et priorités."""

from decimal import Decimal

from app.models import Company
from app.services.vat import applicable_tax_rate, ratio_to_percent


def _company(**kwargs) -> Company:
    return Company(public_id="x", name="Test", slug="test", **kwargs)


def test_ratio_vers_pourcent_20():
    assert ratio_to_percent(Decimal("0.200")) == Decimal("20.00")


def test_ratio_vers_pourcent_10():
    assert ratio_to_percent(Decimal("0.100")) == Decimal("10.00")


def test_ratio_vers_pourcent_5_5():
    assert ratio_to_percent(Decimal("0.055")) == Decimal("5.50")


def test_defaut_entreprise():
    company = _company(default_vat_rate=Decimal("0.100"))
    assert applicable_tax_rate(company) == Decimal("10.00")


def test_arbre_prime_sur_le_defaut():
    # Le taux de l'arbre prime sur le défaut entreprise
    company = _company(default_vat_rate=Decimal("0.200"))
    assert applicable_tax_rate(company, tree_rate=Decimal("10")) == Decimal("10")


def test_franchise_ecrase_tout():
    # Art. 293 B du CGI : la franchise interdit la TVA, même si l'arbre dit 10 %.
    company = _company(default_vat_rate=Decimal("0.200"), vat_exempt=True)
    assert applicable_tax_rate(company, tree_rate=Decimal("10")) == Decimal("0")


def test_reglage_absent_retombe_sur_20():
    company = _company(default_vat_rate=None)
    assert applicable_tax_rate(company) == Decimal("20")

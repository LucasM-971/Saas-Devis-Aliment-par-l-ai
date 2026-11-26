"""Devis « exemple » prêt à importer : un brouillon réaliste par métier.

Sert au bouton « Importer un exemple » du dashboard : l'artisan obtient un
devis complet (client fictif, postes chiffrés, conditions conformes) qu'il
peut ensuite modifier ou supprimer. Aucune dépendance DB ni LLM : le service
renvoie un payload identique à celui d'une création manuelle (QuoteCreate).
"""

from app.schemas.quote import QuoteCreate, QuoteLineIn

# Conditions par défaut : mentions légales usuelles d'un devis du bâtiment
# (validité, acompte, délai). L'artisan reste libre de les ajuster.
_SAMPLE_NOTES = (
    "Devis valable 30 jours à compter de sa date d'émission. "
    "Acompte de 30 % à la signature, solde à la fin des travaux. "
    "Délai d'exécution indicatif : 3 semaines après acceptation."
)


# Un exemple = client fictif, TVA conseillée du métier, et 3-4 postes types.
# vat_rate est un ratio (0.10 = 10 %), aligné sur le front et QuoteCreate.
_SAMPLES: dict[str, dict] = {
    "reno": {
        "vat_rate": 0.055,
        "lines": [
            ("Isolation des combles perdus", "m2", 25, 80),
            ("VMC double flux", "flat", 4500, 1),
            ("Remplacement fenêtres double vitrage", "unit", 480, 4),
        ],
    },
    "plomberie": {
        "vat_rate": 0.10,
        "lines": [
            ("Rénovation complète salle de bain", "flat", 6500, 1),
            ("Installation WC suspendu", "unit", 450, 1),
            ("Pose de robinetterie", "unit", 120, 2),
        ],
    },
    "electricite": {
        "vat_rate": 0.10,
        "lines": [
            ("Mise aux normes du tableau électrique", "flat", 1200, 1),
            ("Pose de prise ou interrupteur", "unit", 45, 8),
            ("Tirage de ligne / câblage", "ml", 25, 30),
        ],
    },
    "menuiserie": {
        "vat_rate": 0.10,
        "lines": [
            ("Fenêtre PVC double vitrage", "unit", 480, 3),
            ("Volet roulant électrique", "unit", 650, 3),
            ("Pose de parquet", "m2", 45, 25),
        ],
    },
    "peinture": {
        "vat_rate": 0.10,
        "lines": [
            ("Préparation et protection des surfaces", "flat", 250, 1),
            ("Peinture murs (2 couches)", "m2", 28, 60),
            ("Peinture plafond", "m2", 32, 25),
        ],
    },
    "serrurerie": {
        "vat_rate": 0.20,
        "lines": [
            ("Installation serrure multipoints", "unit", 350, 1),
            ("Remplacement de cylindre (barillet)", "unit", 120, 2),
            ("Blindage de porte", "flat", 900, 1),
        ],
    },
}

# Devis générique si l'entreprise n'a pas encore choisi de métier.
_DEFAULT_SAMPLE: dict = {
    "vat_rate": 0.20,
    "lines": [
        ("Main d'œuvre", "hour", 45, 8),
        ("Fournitures et matériaux", "flat", 350, 1),
        ("Déplacement", "flat", 40, 1),
    ],
}


def build_sample_quote(metier: str | None) -> QuoteCreate:
    """Construit un devis exemple (brouillon) adapté au métier de l'entreprise."""
    sample = _SAMPLES.get(metier or "", _DEFAULT_SAMPLE)
    return QuoteCreate(
        clientName="Client exemple",
        clientEmail=None,
        vatRate=sample["vat_rate"],
        discountType=None,
        discountValue=0,
        notes=_SAMPLE_NOTES,
        lines=[
            QuoteLineIn(label=label, unit=unit, unitPrice=price, quantity=qty)
            for label, unit, price, qty in sample["lines"]
        ],
    )

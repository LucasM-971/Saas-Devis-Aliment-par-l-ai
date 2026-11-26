"""Correspondance entre les statuts stockés (ENUM SQL, anglais) et les statuts
exposés par l'API / utilisés par le front (français)."""

EN_TO_FR = {
    "draft": "brouillon",
    "pending": "en_attente",
    "validated": "pret",
    "sent": "envoye",
    "accepted": "accepte",
    "rejected": "refuse",
    "expired": "expire",
}
FR_TO_EN = {fr: en for en, fr in EN_TO_FR.items()}


def to_fr(status_en: str) -> str:
    return EN_TO_FR[status_en]


def to_en(status_fr: str) -> str:
    return FR_TO_EN[status_fr]

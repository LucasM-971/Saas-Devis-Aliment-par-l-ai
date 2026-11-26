# Lecture de la base de connaissances du chatbot depuis WidgetSettings.config.

from typing import NamedTuple

from app.schemas.widget import BlocItem, QAItem, TarifM2Item


class KnowledgeBase(NamedTuple):
    qas: list[QAItem]
    blocs: list[BlocItem]
    prix_m2: str | None
    tarifs_m2: list[TarifM2Item]


# Reconstruit la base de connaissances (qas / blocs / prix_m2 / tarifs_m2) depuis la colonne JSON.
def kb_from_config(config: dict | None) -> KnowledgeBase:
    config = config or {}
    qas = [QAItem.model_validate(q) for q in config.get("qas", [])]
    blocs = [BlocItem.model_validate(b) for b in config.get("blocs", [])]
    prix_m2 = config.get("prix_m2") or None
    tarifs = [TarifM2Item.model_validate(t) for t in config.get("tarifs_m2", [])]
    return KnowledgeBase(qas, blocs, prix_m2, tarifs)

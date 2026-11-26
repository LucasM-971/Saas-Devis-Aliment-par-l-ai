from typing import Annotated

from pydantic import BaseModel, Field

# Base de connaissances et apparence du chatbot.


# Une entrée question / réponse de la base de connaissances.
class QAItem(BaseModel):
    question: str = ""
    answer: str = ""


# Un message à boutons : déclenché quand le prospect s'approche du trigger.
class BlocItem(BaseModel):
    trigger: str = ""
    label: str | None = None
    text: str = ""
    buttons: list[str] = Field(default_factory=list)


# Tarif au m² d'une catégorie de travaux (sol, mur…), éventuellement par zone.
class TarifM2Item(BaseModel):
    categorie: str = ""
    zone: str = ""
    prix: str = ""


# Limites à l'écriture seulement
class QAItemIn(QAItem):
    question: str = Field(default="", max_length=500)
    answer: str = Field(default="", max_length=2000)


class BlocItemIn(BlocItem):
    trigger: str = Field(default="", max_length=200)
    label: str | None = Field(default=None, max_length=100)
    text: str = Field(default="", max_length=2000)
    buttons: list[Annotated[str, Field(max_length=80)]] = Field(
        default_factory=list, max_length=6
    )


class TarifM2ItemIn(TarifM2Item):
    categorie: str = Field(default="", max_length=80)
    zone: str = Field(default="", max_length=80)
    prix: str = Field(default="", max_length=20)


# Corps envoyé par le dashboard pour publier la configuration du chatbot.
class WidgetSettingsIn(BaseModel):
    # Colonne String(9) : "#RRGGBBAA" au plus.
    primary_color: str = Field(default="#2563EB", max_length=9)
    greeting_message: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = Field(default=None, max_length=500)
    qas: list[QAItemIn] = Field(default_factory=list, max_length=100)
    blocs: list[BlocItemIn] = Field(default_factory=list, max_length=50)
    prix_m2: str | None = Field(default=None, max_length=50)
    tarifs_m2: list[TarifM2ItemIn] = Field(default_factory=list, max_length=50)


# Configuration renvoyée au dashboard (édition authentifiée).
class WidgetSettingsOut(BaseModel):
    primary_color: str = "#2563EB"
    greeting_message: str | None = None
    avatar_url: str | None = None
    qas: list[QAItem] = Field(default_factory=list)
    blocs: list[BlocItem] = Field(default_factory=list)
    prix_m2: str | None = None
    tarifs_m2: list[TarifM2Item] = Field(default_factory=list)


# Configuration publique consommée par le widget embarqué et la page hébergée.
class WidgetConfigOut(BaseModel):
    company_public_id: str
    company_name: str
    primary_color: str = "#2563EB"
    greeting_message: str | None = None
    avatar_url: str | None = None
    qas: list[QAItem] = Field(default_factory=list)
    blocs: list[BlocItem] = Field(default_factory=list)
    prix_m2: str | None = None
    tarifs_m2: list[TarifM2Item] = Field(default_factory=list)

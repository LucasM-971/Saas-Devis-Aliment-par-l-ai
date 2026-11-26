from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

# Schémas alignés sur les types du front (camelCase, statuts FR, TVA en ratio 0..1).

# Miroir de app.models.base.UNITS : la colonne MySQL est un Enum — une valeur
# inconnue doit être refusée en 422, pas exploser en DataError (500).
Unit = Literal["m2", "ml", "m3", "unit", "hour", "flat"]


class QuoteLineIn(BaseModel):
    # Colonne String(200) : au-delà, l'écriture échouerait en DataError (500).
    label: str = Field(max_length=200)
    # allow_inf_nan=False : NaN/Infinity casseraient les totaux stockés en Decimal.
    quantity: float = Field(ge=0, allow_inf_nan=False)
    unitPrice: float = Field(ge=0, allow_inf_nan=False)
    unit: Unit = "unit"


class QuoteLineOut(BaseModel):
    id: str
    label: str
    quantity: float
    unitPrice: float
    unit: str


class QuoteCreate(BaseModel):
    clientName: str = Field(min_length=1, max_length=200)
    # EmailStr : l'adresse part telle quelle en en-tête SMTP « To ».
    clientEmail: EmailStr | None = Field(default=None, max_length=255)
    vatRate: float = Field(default=0.2, ge=0, le=1, allow_inf_nan=False)
    # Remise globale : 'percent' (valeur en %) ou 'amount' (valeur en €).
    discountType: str | None = Field(default=None, pattern="^(percent|amount)$")
    discountValue: float = Field(default=0, ge=0, allow_inf_nan=False)
    notes: str | None = None
    lines: list[QuoteLineIn]

    # Le front envoie "" quand le champ e-mail est vide : on le traite comme absent.
    @field_validator("clientEmail", mode="before")
    @classmethod
    def _empty_email_is_none(cls, v: object) -> object:
        return None if v == "" else v


class QuoteOut(BaseModel):
    id: str
    reference: str
    clientName: str
    clientEmail: str | None = None
    status: str
    # Résultat du dernier envoi e-mail : none / sent / failed (badge dashboard).
    emailStatus: str = "none"
    vatRate: float
    discountType: str | None = None
    discountValue: float = 0
    notes: str | None = None
    createdAt: str
    conversationId: str | None = None
    lines: list[QuoteLineOut]


class StatusUpdate(BaseModel):
    status: str


# Brouillon extrait d'un fichier importé (PDF/DOCX/texte). Non persisté : il
# pré-remplit le formulaire côté front, où l'utilisateur le corrige avant d'enregistrer.
class QuoteDraftLine(BaseModel):
    label: str
    quantity: float = 1
    unitPrice: float = 0
    unit: str = "unit"


class QuoteDraftOut(BaseModel):
    clientName: str = ""
    clientEmail: str | None = None
    vatRate: float = 0.2
    notes: str | None = None
    lines: list[QuoteDraftLine] = []
    # Vrai si l'extraction a produit au moins une ligne exploitable.
    parsed: bool = False

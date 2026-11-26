from pydantic import BaseModel, Field

from app.schemas.quote import Unit


class PriceItemOut(BaseModel):
    id: str
    label: str
    unit: str
    unitPrice: float


class PriceItemIn(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    # Unit : la colonne MySQL est un Enum — valeur inconnue = 422, pas 500.
    unit: Unit = "unit"
    # allow_inf_nan=False : Infinity passerait ge=0 puis corromprait les montants Decimal.
    unitPrice: float = Field(ge=0, allow_inf_nan=False)

from typing import Any, Optional

from pydantic import BaseModel


class QuoteTemplateOut(BaseModel):
    accentColor: str
    logoDataUrl: Optional[str] = None
    logoPosition: str
    showReference: bool
    showDate: bool
    showClientEmail: bool
    showCompanyDetails: bool = True
    showLegal: bool = True
    footerText: str
    # Design importé (papier à en-tête / modèle) posé en fond de page.
    backgroundImageUrl: Optional[str] = None
    canvasLayout: Optional[list[Any]] = None


class QuoteTemplateIn(BaseModel):
    accentColor: str = "#4f46e5"
    logoDataUrl: Optional[str] = None
    logoPosition: str = "left"
    showReference: bool = True
    showDate: bool = True
    showClientEmail: bool = True
    showCompanyDetails: bool = True
    showLegal: bool = True
    footerText: str = "Devis valable 30 jours à compter de sa date d'émission."
    backgroundImageUrl: Optional[str] = None
    canvasLayout: Optional[list[Any]] = None

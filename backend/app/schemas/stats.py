from pydantic import BaseModel


class StatsOut(BaseModel):
    demandesEnAttente: int
    pretAValider: int
    montantPotentiel: float
    tauxCompletion: float


# Compteurs agrégés toutes entreprises confondues, affichés sur la landing.
class PlatformStatsOut(BaseModel):
    quotesGenerated: int
    companiesRegistered: int
    leadsCaptured: int

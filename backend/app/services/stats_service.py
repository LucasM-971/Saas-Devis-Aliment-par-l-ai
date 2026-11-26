"""Calcul des indicateurs du tableau de bord (fonction pure, statuts EN)."""

from dataclasses import dataclass

# Statuts (anglais, tels que stockés) considérés comme « en cours ».
IN_PROGRESS = {"pending", "validated", "sent"}


@dataclass(frozen=True)
class DashboardStats:
    demandesEnAttente: int
    pretAValider: int
    montantPotentiel: float
    tauxCompletion: float


# quotes : liste de (statut_en, total_ttc).
def compute_stats(quotes: list[tuple[str, float]]) -> DashboardStats:
    pending = sum(1 for status, _ in quotes if status == "pending")
    validated = sum(1 for status, _ in quotes if status == "validated")
    montant = sum(total for status, total in quotes if status in IN_PROGRESS)
    accepted = sum(1 for status, _ in quotes if status == "accepted")
    rejected = sum(1 for status, _ in quotes if status == "rejected")
    decided = accepted + rejected
    return DashboardStats(
        demandesEnAttente=pending,
        pretAValider=validated,
        montantPotentiel=round(montant),
        tauxCompletion=0.0 if decided == 0 else accepted / decided,
    )

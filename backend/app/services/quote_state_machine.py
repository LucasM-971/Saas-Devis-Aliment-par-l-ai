"""Machine à états des statuts de devis (fonction pure).

Définit les transitions autorisées ; toute autre transition est refusée.
"""

# Transitions autorisées : statut courant -> statuts cibles possibles.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"pending", "validated", "expired"},
    "pending": {"validated", "rejected", "expired"},
    "validated": {"sent", "rejected", "expired"},
    "sent": {"accepted", "rejected", "expired"},
    "accepted": set(),  # terminal
    "rejected": set(),  # terminal
    "expired": set(),  # terminal
}


class InvalidTransition(ValueError):
    pass


def can_transition(current: str, target: str) -> bool:
    return target in ALLOWED_TRANSITIONS.get(current, set())


# Valide une transition ou lève InvalidTransition.
def assert_transition(current: str, target: str) -> None:
    if not can_transition(current, target):
        raise InvalidTransition(f"Transition interdite : {current} → {target}")

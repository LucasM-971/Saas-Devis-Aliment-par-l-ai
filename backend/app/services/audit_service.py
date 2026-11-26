"""Journal d'activité : une ligne par action significative sur l'espace.

Les libellés d'affichage (type / acteur / action / cible) sont rangés dans
`meta`, ce que consomme directement la page « Journal d'activité » du dashboard.
N'appelle pas commit : l'écriture part avec la transaction de l'action auditée.
"""

from sqlalchemy.orm import Session

from app.models import AuditLog, User


def _display_name(db: Session, user_id: int | None) -> str:
    if user_id is None:
        return "Système"
    user = db.get(User, user_id)
    if user is None:
        return "Système"
    return " ".join(p for p in [user.first_name, user.last_name] if p) or user.email


# Enregistre un événement. `actor` prime sur `actor_user_id` (ex. « Widget », « IA Devis AI »).
def record(
    db: Session,
    *,
    company_id: int,
    type_: str,
    action: str,
    target: str,
    actor: str | None = None,
    actor_user_id: int | None = None,
) -> None:
    db.add(
        AuditLog(
            company_id=company_id,
            actor_user_id=actor_user_id,
            action=f"{type_}.event",
            entity_type=type_,
            meta={
                "type": type_,
                "actor": actor or _display_name(db, actor_user_id),
                "action": action,
                "target": target,
            },
        )
    )

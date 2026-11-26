"""Autorisation par rôle : owner > admin > member > viewer (lecture seule)."""

from fastapi import HTTPException, status

from app.models import Membership

WRITER_ROLES = ("owner", "admin", "member")
ADMIN_ROLES = ("owner", "admin")


def require_writer(membership: Membership) -> None:
    if membership.role not in WRITER_ROLES:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Votre rôle (lecteur) ne permet pas de modifier les données.",
        )


def require_admin(membership: Membership) -> None:
    if membership.role not in ADMIN_ROLES:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Seul un propriétaire ou un admin peut modifier la configuration.",
        )

"""Autorisation par rôle au sein d'une entreprise.

Grille des rôles (du plus au moins privilégié) :
- owner  : tout, y compris l'abonnement ;
- admin  : configuration (fiche, grille, zones, assistant, modèle de devis) + écriture métier ;
- member : écriture métier (devis, prospects) ;
- viewer : lecture seule.
"""

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

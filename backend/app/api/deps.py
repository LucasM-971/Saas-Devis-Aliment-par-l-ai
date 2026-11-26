from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database import get_db
from app.models import Membership, User

bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


# Récupère l'utilisateur authentifié à partir du token Bearer.
def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentification requise")
    user_id = decode_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token invalide ou expiré")
    try:
        user_pk = int(user_id)
    except (TypeError, ValueError):
        # `sub` non numérique : token forgé ou d'un autre système → 401, pas 500.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token invalide ou expiré") from None
    user = db.get(User, user_pk)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Utilisateur introuvable")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


# Entreprise active (isolation multi-tenant) : via l'en-tête X-Company-Id,
# sinon la première entreprise de l'utilisateur. Vérifie l'appartenance.
def get_active_membership(
    db: DbSession,
    current_user: CurrentUser,
    x_company_id: Annotated[int | None, Header()] = None,
) -> Membership:
    stmt = select(Membership).where(Membership.user_id == current_user.id)
    if x_company_id is not None:
        stmt = stmt.where(Membership.company_id == x_company_id)
    membership = db.scalars(stmt.order_by(Membership.id)).first()
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Aucune entreprise active")
    return membership


ActiveMembership = Annotated[Membership, Depends(get_active_membership)]


# Réserve une action aux propriétaires et administrateurs de l'entreprise active
# (gestion de l'équipe : inviter, changer un rôle, retirer un membre).
def require_manager(membership: ActiveMembership) -> Membership:
    if membership.role not in ("owner", "admin"):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Action réservée aux administrateurs de l'entreprise"
        )
    return membership


ManagerMembership = Annotated[Membership, Depends(require_manager)]

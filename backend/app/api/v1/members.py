from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import ActiveMembership, DbSession, ManagerMembership
from app.models import Invitation, Membership, User
from app.schemas.member import MemberOut, MemberUpdate

router = APIRouter(prefix="/api/v1/members", tags=["members"])


def _member_out(m: Membership, u: User) -> MemberOut:
    return MemberOut(
        id=f"m{m.id}",
        name=" ".join(p for p in [u.first_name, u.last_name] if p) or u.email,
        email=u.email,
        role=m.role,
        status="active" if m.status == "active" else "invited",
    )


def _invitation_out(inv: Invitation) -> MemberOut:
    return MemberOut(id=f"i{inv.id}", name=inv.email, email=inv.email, role=inv.role, status="invited")


# « m12 » → 12, ou -1 si le préfixe ne correspond pas.
def _raw_id(member_id: str, prefix: str) -> int:
    if not member_id.startswith(prefix):
        return -1
    try:
        return int(member_id[len(prefix) :])
    except ValueError:
        return -1


# Adhésion de l'entreprise active, sinon 404.
def _get_membership(db: DbSession, member_id: str, company_id: int) -> Membership:
    membership = db.get(Membership, _raw_id(member_id, "m"))
    if membership is None or membership.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Membre introuvable")
    return membership


# Retrouve une invitation en attente de l'entreprise active (sinon 404).
def _get_invitation(db: DbSession, member_id: str, company_id: int) -> Invitation:
    invitation = db.get(Invitation, _raw_id(member_id, "i"))
    if (
        invitation is None
        or invitation.company_id != company_id
        or invitation.status != "pending"
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation introuvable")
    return invitation


def _owner_count(db: DbSession, company_id: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(Membership.company_id == company_id, Membership.role == "owner")
        )
        or 0
    )


@router.get("", response_model=list[MemberOut])
def list_members(db: DbSession, membership: ActiveMembership) -> list[MemberOut]:
    company_id = membership.company_id

    rows = db.execute(
        select(Membership, User)
        .join(User, Membership.user_id == User.id)
        .where(Membership.company_id == company_id)
        .order_by(Membership.id)
    ).all()
    members = [_member_out(m, u) for m, u in rows]

    pending = db.scalars(
        select(Invitation)
        .where(Invitation.company_id == company_id, Invitation.status == "pending")
        .order_by(Invitation.id)
    ).all()
    members += [_invitation_out(inv) for inv in pending]
    return members


# Change le rôle d'un membre (m…) ou d'une invitation (i…).
@router.patch("/{member_id}", response_model=MemberOut)
def update_member(
    member_id: str, payload: MemberUpdate, db: DbSession, manager: ManagerMembership
) -> MemberOut:
    company_id = manager.company_id

    if member_id.startswith("i"):
        invitation = _get_invitation(db, member_id, company_id)
        invitation.role = payload.role
        db.commit()
        db.refresh(invitation)
        return _invitation_out(invitation)

    membership = _get_membership(db, member_id, company_id)
    # Seul un owner peut modifier un owner
    if membership.role == "owner" and manager.role != "owner":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Seul un propriétaire peut modifier un propriétaire"
        )
    # On ne rétrograde pas le dernier propriétaire : l'entreprise doit en garder un.
    if membership.role == "owner" and _owner_count(db, company_id) <= 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "L'entreprise doit conserver au moins un propriétaire"
        )
    membership.role = payload.role
    db.commit()
    db.refresh(membership)
    user = db.get(User, membership.user_id)
    return _member_out(membership, user)


# Retire un membre ou révoque une invitation.
@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(member_id: str, db: DbSession, manager: ManagerMembership) -> None:
    company_id = manager.company_id

    if member_id.startswith("i"):
        invitation = _get_invitation(db, member_id, company_id)
        invitation.status = "revoked"
        db.commit()
        return

    membership = _get_membership(db, member_id, company_id)
    if membership.role == "owner" and manager.role != "owner":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Seul un propriétaire peut retirer un propriétaire"
        )
    if membership.role == "owner" and _owner_count(db, company_id) <= 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "L'entreprise doit conserver au moins un propriétaire"
        )
    db.delete(membership)
    db.commit()

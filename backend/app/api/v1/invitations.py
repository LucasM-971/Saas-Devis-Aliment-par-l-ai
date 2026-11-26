"""Invitations d'équipe : envoi, consultation, acceptation."""

import hashlib
import html
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from app.api.deps import ActiveMembership, DbSession
from app.config import settings
from app.core.rate_limit import AUTH_LIMITER, rate_limited
from app.core.security import create_access_token, hash_password, verify_password
from app.email.sender import render_template, send_email
from app.models import Company, Invitation, Membership, User
from app.schemas.auth import TokenOut
from app.services import audit_service
from app.services.permissions import require_admin

router = APIRouter(prefix="/api/v1/invitations", tags=["invitations"])

INVITE_TTL = timedelta(days=7)

# Rôles attribuables par invitation (le rôle owner ne se délègue pas).
INVITABLE_ROLES = ("admin", "member", "viewer")

ROLE_LABELS = {"admin": "Administrateur", "member": "Membre", "viewer": "Lecteur"}

# Rate limit anti brute-force sur les endpoints publics
_auth_rate_limit = Depends(rate_limited(AUTH_LIMITER))


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class InviteIn(BaseModel):
    # Colonne String(255) : au-delà, l'INSERT échouerait en DataError (500).
    email: EmailStr = Field(max_length=255)
    role: str = "member"


class InviteOut(BaseModel):
    id: str
    email: str
    role: str
    expiresAt: str


class LookupOut(BaseModel):
    email: str
    companyName: str
    role: str
    inviterName: str | None = None
    userExists: bool


class AcceptIn(BaseModel):
    token: str = Field(max_length=64)
    # Nouveau compte : mot de passe à créer ; compte existant : mot de passe actuel.
    password: str = Field(min_length=8, max_length=128)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)


# Invite un coéquipier : crée le jeton et envoie l'e-mail d'invitation.
@router.post("", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
def invite(payload: InviteIn, db: DbSession, membership: ActiveMembership) -> InviteOut:
    require_admin(membership)
    if payload.role not in INVITABLE_ROLES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Rôle non attribuable")

    company_id = membership.company_id
    already_member = db.scalar(
        select(Membership.id)
        .join(User, Membership.user_id == User.id)
        .where(Membership.company_id == company_id, User.email == payload.email)
    )
    if already_member:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cette personne fait déjà partie de l'équipe")

    pending = db.scalar(
        select(Invitation.id).where(
            Invitation.company_id == company_id,
            Invitation.email == payload.email,
            Invitation.status == "pending",
        )
    )
    if pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "Une invitation est déjà en attente pour cet e-mail")

    token = secrets.token_urlsafe(32)
    invitation = Invitation(
        company_id=company_id,
        email=payload.email,
        role=payload.role,
        token_hash=_hash_token(token),
        invited_by=membership.user_id,
        expires_at=_now() + INVITE_TTL,
    )
    db.add(invitation)

    company = db.get(Company, company_id)
    inviter = db.get(User, membership.user_id)
    inviter_name = (
        (" ".join(p for p in [inviter.first_name, inviter.last_name] if p) or inviter.email)
        if inviter
        else "Un membre de l'équipe"
    )
    send_email(
        to=payload.email,
        subject=f"Invitation à rejoindre {company.name} sur Devis AI",
        html=render_template(
            "invite_user.html",
            company_name=html.escape(company.name),
            inviter_name=html.escape(inviter_name),
            role_label=ROLE_LABELS[payload.role],
            invite_url=f"{settings.frontend_url}/accept-invite?token={token}",
        ),
    )

    audit_service.record(
        db, company_id=company_id, type_="member",
        action="a invité un membre", target=payload.email,
        actor_user_id=membership.user_id,
    )
    db.commit()
    db.refresh(invitation)
    return InviteOut(
        id=str(invitation.id),
        email=invitation.email,
        role=invitation.role,
        expiresAt=invitation.expires_at.isoformat(),
    )


# Révoque une invitation en attente.
@router.delete("/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke(invitation_id: int, db: DbSession, membership: ActiveMembership) -> None:
    require_admin(membership)
    invitation = db.get(Invitation, invitation_id)
    if invitation is None or invitation.company_id != membership.company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation introuvable")
    if invitation.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "Cette invitation n'est plus en attente")
    invitation.status = "revoked"
    audit_service.record(
        db, company_id=membership.company_id, type_="member",
        action="a révoqué l'invitation de", target=invitation.email,
        actor_user_id=membership.user_id,
    )
    db.commit()


def _get_valid_invitation(db: DbSession, token: str) -> Invitation:
    invitation = db.scalar(
        select(Invitation).where(Invitation.token_hash == _hash_token(token))
    )
    if invitation is None or invitation.status != "pending" or invitation.expires_at < _now():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Invitation invalide, expirée ou déjà utilisée. Demandez un nouveau lien.",
        )
    return invitation


# Détails d'une invitation (page publique d'acceptation).
@router.get("/lookup/{token}", response_model=LookupOut, dependencies=[_auth_rate_limit])
def lookup(token: str, db: DbSession) -> LookupOut:
    invitation = _get_valid_invitation(db, token)
    company = db.get(Company, invitation.company_id)
    inviter = db.get(User, invitation.invited_by) if invitation.invited_by else None
    user_exists = bool(db.scalar(select(User.id).where(User.email == invitation.email)))
    return LookupOut(
        email=invitation.email,
        companyName=company.name if company else "",
        role=invitation.role,
        inviterName=(
            (" ".join(p for p in [inviter.first_name, inviter.last_name] if p) or inviter.email)
            if inviter
            else None
        ),
        userExists=user_exists,
    )


# Accepte l'invitation : crée ou vérifie le compte, ajoute le membre.
@router.post("/accept", response_model=TokenOut, dependencies=[_auth_rate_limit])
def accept(payload: AcceptIn, db: DbSession) -> TokenOut:
    invitation = _get_valid_invitation(db, payload.token)

    user = db.scalar(select(User).where(User.email == invitation.email))
    if user is None:
        user = User(
            email=invitation.email,
            password_hash=hash_password(payload.password),
            first_name=payload.first_name,
            last_name=payload.last_name,
            email_verified_at=_now(),  # le lien d'invitation prouve l'adresse
        )
        db.add(user)
        db.flush()
    else:
        if not verify_password(payload.password, user.password_hash):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Mot de passe incorrect pour ce compte existant.",
            )

    existing = db.scalar(
        select(Membership.id).where(
            Membership.user_id == user.id, Membership.company_id == invitation.company_id
        )
    )
    if existing is None:
        db.add(
            Membership(user_id=user.id, company_id=invitation.company_id, role=invitation.role)
        )

    invitation.status = "accepted"
    invitation.accepted_at = _now()
    audit_service.record(
        db, company_id=invitation.company_id, type_="member",
        action="a rejoint l'équipe", target=invitation.email,
        actor_user_id=user.id,
    )
    db.commit()
    return TokenOut(access_token=create_access_token(str(user.id)))

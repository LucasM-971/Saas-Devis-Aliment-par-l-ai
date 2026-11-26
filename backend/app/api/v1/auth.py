import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.api.v1.companies import serialize_company
from app.config import settings
from app.core.rate_limit import AUTH_LIMITER, rate_limited
from app.core.security import create_access_token, hash_password, verify_password
from app.email.sender import render_template, send_email
from app.models import Company, Membership, PasswordResetToken, User
from app.schemas.auth import (
    LoginIn,
    MembershipOut,
    ProfileUpdateIn,
    RegisterIn,
    TokenOut,
    UserOut,
)
from app.services.slugs import unique_company_slug

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# Durée de validité d'un lien de réinitialisation de mot de passe.
RESET_TOKEN_TTL = timedelta(hours=1)

# Préférences de notification par défaut (aligné sur Réglages › Notifications).
DEFAULT_NOTIFICATION_PREFS = {
    "new_lead": True,
    "quote_accepted": True,
    "quote_refused": False,
    "weekly": True,
}

_auth_rate_limit = Depends(rate_limited(AUTH_LIMITER))


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _user_out(db: DbSession, user: User) -> UserOut:
    rows = db.execute(
        select(Membership, Company).join(Company, Membership.company_id == Company.id).where(
            Membership.user_id == user.id
        )
    ).all()
    memberships = [MembershipOut(company=serialize_company(c), role=m.role) for m, c in rows]
    return UserOut(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        notification_prefs={**DEFAULT_NOTIFICATION_PREFS, **(user.notification_prefs or {})},
        memberships=memberships,
    )


# Crée un compte + sa première entreprise (rôle owner) et renvoie un token.
@router.post(
    "/register",
    response_model=TokenOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_auth_rate_limit],
)
def register(payload: RegisterIn, db: DbSession) -> TokenOut:
    if db.scalar(select(User.id).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cet email est déjà utilisé")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
    )
    db.add(user)
    db.flush()

    company = Company(
        public_id=str(uuid.uuid4()),
        name=payload.company_name,
        slug=unique_company_slug(db, payload.company_name),
    )
    db.add(company)
    db.flush()

    db.add(Membership(user_id=user.id, company_id=company.id, role="owner"))
    db.commit()

    return TokenOut(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenOut, dependencies=[_auth_rate_limit])
def login(payload: LoginIn, db: DbSession) -> TokenOut:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Identifiants invalides")
    return TokenOut(access_token=create_access_token(str(user.id)))


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(max_length=64)
    password: str = Field(min_length=8, max_length=128)


# Demande de réinitialisation : répond toujours 204 (pas d'énumération d'emails).
@router.post(
    "/forgot-password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_auth_rate_limit],
)
def forgot_password(payload: ForgotPasswordIn, db: DbSession) -> None:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not user.is_active:
        return

    token = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(token),
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + RESET_TOKEN_TTL,
        )
    )
    db.commit()

    reset_url = f"{settings.frontend_url}/reset-password?token={token}"
    send_email(
        to=user.email,
        subject="Réinitialisation de votre mot de passe — Devis AI",
        html=render_template("reset_password.html", reset_url=reset_url),
    )


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_auth_rate_limit],
)
def reset_password(payload: ResetPasswordIn, db: DbSession) -> None:
    entry = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == _hash_token(payload.token)
        )
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if entry is None or entry.used_at is not None or entry.expires_at < now:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Lien invalide ou expiré : refaites une demande."
        )

    user = db.get(User, entry.user_id)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Compte introuvable")
    user.password_hash = hash_password(payload.password)
    # Invalide les autres liens de reset encore actifs
    others = db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None)
        )
    ).all()
    for token in others:
        token.used_at = now
    db.commit()


@router.get("/me", response_model=UserOut)
def me(current_user: CurrentUser, db: DbSession) -> UserOut:
    return _user_out(db, current_user)


# Mise à jour du profil (page Réglages › Profil).
@router.patch("/me", response_model=UserOut)
def update_me(payload: ProfileUpdateIn, current_user: CurrentUser, db: DbSession) -> UserOut:
    if payload.first_name is not None:
        current_user.first_name = payload.first_name or None
    if payload.last_name is not None:
        current_user.last_name = payload.last_name or None
    if payload.notification_prefs is not None:
        # Seules les clés connues sont conservées (pas de JSON arbitraire en base).
        current_user.notification_prefs = {
            k: bool(v) for k, v in payload.notification_prefs.items()
            if k in DEFAULT_NOTIFICATION_PREFS
        }
    db.commit()
    db.refresh(current_user)
    return _user_out(db, current_user)

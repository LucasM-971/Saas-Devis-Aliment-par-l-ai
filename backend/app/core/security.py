from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    pw = password.encode("utf-8")[:72]  # bcrypt est limité à 72 octets
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("utf-8"))


def create_access_token(subject: str, expires_minutes: int | None = None) -> str:
    minutes = expires_minutes or settings.access_token_expire_minutes
    payload = {"sub": subject, "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes)}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


# Renvoie le subject (id user) du token, ou None si invalide/expiré.
def decode_token(token: str) -> str | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM]).get("sub")
    except JWTError:
        return None

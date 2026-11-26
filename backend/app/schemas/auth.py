from pydantic import BaseModel, EmailStr, Field

from app.schemas.company import CompanyDetailOut


# max_length aligné sur les colonnes MySQL : une valeur plus longue ferait
# échouer l'INSERT en DataError (500) au lieu d'un 422 propre.
class RegisterIn(BaseModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    company_name: str = Field(min_length=1, max_length=150)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MembershipOut(BaseModel):
    company: CompanyDetailOut
    role: str


class UserOut(BaseModel):
    id: int
    email: str
    first_name: str | None = None
    last_name: str | None = None
    notification_prefs: dict[str, bool] = {}
    memberships: list[MembershipOut] = []


class ProfileUpdateIn(BaseModel):
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    notification_prefs: dict[str, bool] | None = None

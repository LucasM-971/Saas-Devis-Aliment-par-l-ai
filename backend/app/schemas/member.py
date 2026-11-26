from typing import Literal

from pydantic import BaseModel


class MemberOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    status: str  # "active" | "invited"


class MemberUpdate(BaseModel):
    # La propriété (owner) se transfère via une action dédiée : non attribuable ici.
    role: Literal["admin", "member", "viewer"]

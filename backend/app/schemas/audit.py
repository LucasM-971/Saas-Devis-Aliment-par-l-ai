from pydantic import BaseModel


class AuditOut(BaseModel):
    id: str
    type: str
    actor: str
    action: str
    target: str
    createdAt: str

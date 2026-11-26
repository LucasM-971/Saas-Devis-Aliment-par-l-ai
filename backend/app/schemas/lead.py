from pydantic import BaseModel


class LeadOut(BaseModel):
    id: str
    name: str
    email: str | None = None
    phone: str | None = None
    source: str
    createdAt: str
    quoteId: str | None = None
    conversationId: str | None = None

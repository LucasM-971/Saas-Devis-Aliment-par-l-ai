from typing import Literal

from pydantic import BaseModel, Field

from app.llm.schemas import MAX_HISTORY_MESSAGES, MAX_MESSAGE_CHARS, HistoryMessage

# Schémas du parcours widget « conversation → devis ».
# Surface publique (pas d'auth) : l'entreprise est identifiée par son public_id.


# Corps envoyé par le widget pour transformer une conversation en devis.
class QuoteFromChatRequest(BaseModel):
    company_public_id: str = Field(max_length=36)
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=MAX_HISTORY_MESSAGES)
    # Borné à la colonne conversations.session_uid (CHAR(36)) : au-delà, l'INSERT
    # échouerait en DataError (500 sur endpoint public).
    session_uid: str | None = Field(default=None, max_length=36)


# Une ligne du devis chiffré renvoyée au prospect.
class QuoteLineResult(BaseModel):
    label: str
    unit: str
    quantity: float
    unit_price: float
    line_total: float


# Le devis chiffré (montants en euros, TVA en pourcentage).
class QuoteResult(BaseModel):
    reference: str
    subtotal: float
    tax_rate: float
    tax_amount: float
    total: float
    currency: str = "EUR"
    lines: list[QuoteLineResult]


# Résultat du parcours : soit un devis, soit un lead (demande non chiffrable).
class ChatQuoteResponse(BaseModel):
    outcome: Literal["quote", "lead", "missing_info"]
    quote: QuoteResult | None = None
    missing_fields: list[str] = []
    lead_reason: str | None = None
    message: str


# ─── Consultation d'une conversation côté dashboard (auth) ───────────────────


# Un message du fil de discussion (transcription stockée dans Conversation.transcript).
class ConversationMessageOut(BaseModel):
    role: str
    content: str


# Transcription complète rattachée à un devis ou un prospect.
class ConversationOut(BaseModel):
    id: str
    status: str
    createdAt: str
    completedAt: str | None = None
    messages: list[ConversationMessageOut]

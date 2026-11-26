from fastapi import APIRouter, HTTPException, status

from app.api.deps import ActiveMembership, DbSession
from app.models import Conversation
from app.schemas.conversation import ConversationMessageOut, ConversationOut

router = APIRouter(prefix="/api/v1/conversations", tags=["conversations"])


# Transcription du chat rattachée à un devis ou un prospect. Réservée à l'entreprise
# propriétaire (isolation multi-tenant via l'appartenance active).
@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: int, db: DbSession, membership: ActiveMembership
) -> ConversationOut:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.company_id != membership.company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation introuvable")

    transcript = conversation.transcript or []
    messages = [
        ConversationMessageOut(role=m.get("role", "user"), content=m.get("content", ""))
        for m in transcript
        if isinstance(m, dict)
    ]
    return ConversationOut(
        id=str(conversation.id),
        status=conversation.status,
        createdAt=conversation.created_at.isoformat(),
        completedAt=conversation.completed_at.isoformat() if conversation.completed_at else None,
        messages=messages,
    )

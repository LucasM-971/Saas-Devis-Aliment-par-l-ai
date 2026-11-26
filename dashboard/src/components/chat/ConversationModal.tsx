import { Bot, Loader2, MessageSquareOff, User } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { BotText } from '@/components/chat/ChatThread';
import { accentStyle } from '@/components/chat/accent';
import { useApi } from '@/hooks/useApi';
import { formatDate } from '@/lib/format';
import type { Conversation } from '@/types';

// Fil de discussion en lecture seule : la transcription du chat qu'un client a eu
// avec le chatbot, rattachée à un devis ou un prospect.
export function ConversationModal({
  conversationId,
  title = 'Conversation',
  subtitle,
  onClose,
}: {
  conversationId: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <div>
          <span>{title}</span>
          {subtitle && <p className="mt-0.5 text-xs font-normal text-slate-400">{subtitle}</p>}
        </div>
      }
    >
      <ConversationThread conversationId={conversationId} />
    </Modal>
  );
}

// Transcription seule, réutilisable (modale dédiée ou onglet de la fiche devis).
export function ConversationThread({ conversationId }: { conversationId: string }) {
  const { data, loading, error } = useApi<Conversation>(
    `/api/v1/conversations/${conversationId}`,
  );

  return (
    <>
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 className="size-4 animate-spin" />
          Chargement de la conversation…
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <MessageSquareOff className="size-6 text-slate-300" />
          <p className="text-sm text-slate-500">Impossible de charger cette conversation.</p>
          <p className="text-xs text-slate-400">{error}</p>
        </div>
      )}

      {!loading && !error && data && data.messages.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <MessageSquareOff className="size-6 text-slate-300" />
          <p className="text-sm text-slate-500">Aucun message enregistré pour cette conversation.</p>
        </div>
      )}

      {!loading && !error && data && data.messages.length > 0 && (
        <div style={accentStyle('#2563EB')}>
          <p className="mb-4 text-xs text-slate-400">Reçue le {formatDate(data.createdAt)}</p>
          <div className="flex flex-col gap-4">
            {data.messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' ? (
                  <div className="flex max-w-[85%] items-end gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--chat-accent-soft)] text-[var(--chat-accent)]">
                      <Bot className="size-3.5" />
                    </span>
                    <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
                      <BotText content={msg.content} />
                    </div>
                  </div>
                ) : (
                  <div className="flex max-w-[85%] items-end gap-2">
                    <div className="rounded-2xl rounded-br-sm bg-[var(--chat-accent)] px-3.5 py-2.5 text-sm text-white">
                      {msg.content}
                    </div>
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                      <User className="size-3.5" />
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

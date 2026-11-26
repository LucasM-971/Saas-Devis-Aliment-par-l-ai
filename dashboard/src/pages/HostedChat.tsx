import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bot, FileText, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { ChatThread } from '@/components/chat/ChatThread';
import { accentStyle } from '@/components/chat/accent';
import { isQuoteButton, starterSuggestions, useChatConversation, type ChatConfig } from '@/lib/chat-engine';
import type { MessageBloc, QA } from '@/lib/chat-match';

// Réponse de GET /api/v1/chat/config/{public_id}.
type ServerConfig = {
  company_public_id: string;
  company_name: string;
  primary_color: string;
  greeting_message: string | null;
  qas: { question: string; answer: string }[];
  blocs: { trigger: string; label?: string | null; text: string; buttons: string[] }[];
  prix_m2: string | null;
  tarifs_m2?: { categorie: string; zone: string; prix: string }[];
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; cfg: ChatConfig; primaryColor: string }
  | { status: 'error' };

// Page de chat plein écran distribuée aux prospects via un lien (ceux sans site web).
export default function HostedChat() {
  const { publicId = '' } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api
      .get<ServerConfig>(`/api/v1/chat/config/${publicId}`)
      .then((c) => {
        if (cancelled) return;
        const qas: QA[] = c.qas.map((q, i) => ({ id: String(i), question: q.question, answer: q.answer }));
        const blocs: MessageBloc[] = c.blocs.map((b, i) => ({
          id: String(i),
          trigger: b.trigger,
          label: b.label ?? undefined,
          text: b.text,
          buttons: b.buttons,
        }));
        setState({
          status: 'ready',
          primaryColor: c.primary_color || '#2563EB',
          cfg: {
            companyName: c.company_name,
            greeting: c.greeting_message,
            qas,
            blocs,
            prixM2: c.prix_m2 || undefined,
            tarifs: (c.tarifs_m2 ?? []).map((t, i) => ({ id: String(i), ...t })),
            companyPublicId: c.company_public_id,
          },
        });
      })
      .catch(() => !cancelled && setState({ status: 'error' }));

    return () => {
      cancelled = true;
    };
  }, [publicId]);

  if (state.status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-100 text-slate-400">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-100 px-6 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-800">Assistant indisponible</p>
          <p className="mt-1 text-sm text-slate-500">Ce lien n'est pas valide ou l'entreprise n'a pas encore publié son assistant.</p>
        </div>
      </div>
    );
  }

  return <HostedChatReady cfg={state.cfg} primaryColor={state.primaryColor} />;
}

function HostedChatReady({ cfg, primaryColor }: { cfg: ChatConfig; primaryColor: string }) {
  const { messages, busy, send, reset, requestQuote, canQuote, failedText, retry } =
    useChatConversation(cfg);
  const [input, setInput] = useState('');
  const starters = useMemo(() => starterSuggestions(cfg.qas, cfg.blocs, cfg.prixM2, cfg.tarifs), [cfg]);

  const handleSend = (text: string) => {
    setInput('');
    // Bouton de fin « Faire la demande de devis » : envoie la demande au lieu de la discussion.
    if (canQuote && isQuoteButton(text)) {
      void requestQuote(text);
      return;
    }
    send(text);
  };

  const hasExchanged = messages.some((m) => m.role === 'user');
  const alreadyQuoted = messages.some((m) => m.quote);

  return (
    <div style={accentStyle(primaryColor)} className="grid min-h-dvh place-items-center bg-slate-100 p-0 sm:p-6">
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-white shadow-xl sm:h-[min(720px,90dvh)] sm:max-w-lg sm:rounded-2xl sm:border sm:border-slate-200">
        {/* En-tête */}
        <div className="flex items-center justify-between bg-[var(--chat-accent)] px-4 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-full bg-white/20">
              <Bot className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold leading-none">{cfg.companyName}</p>
              <p className="mt-0.5 text-xs text-white/70">Assistant · répond instantanément</p>
            </div>
          </div>
          <button
            onClick={() => {
              reset();
              setInput('');
            }}
            title="Recommencer"
            className="grid size-8 place-items-center rounded-md text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>

        <ChatThread
          messages={messages}
          busy={busy}
          input={input}
          onInput={setInput}
          onSend={handleSend}
          starters={starters}
          footer={
            <>
              {failedText && (
                <div className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-xs text-red-700">
                    Connexion interrompue — votre message n'est pas parti.
                  </p>
                  <button
                    onClick={retry}
                    disabled={busy}
                    className="shrink-0 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    Réessayer
                  </button>
                </div>
              )}
              {canQuote && hasExchanged && !alreadyQuoted ? (
                <div className="border-t border-slate-100 px-3 pt-3">
                  <button
                    onClick={() => void requestQuote()}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--chat-accent)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <FileText className="size-4" /> Générer mon devis estimatif
                  </button>
                </div>
              ) : null}
            </>
          }
        />

        <p className="bg-slate-50 px-4 py-2 text-center text-[11px] text-slate-400">
          Vos coordonnées servent uniquement à l'établissement de votre devis par{' '}
          {cfg.companyName} et sont conservées 12 mois.{' '}
          Propulsé par <span className="font-semibold text-slate-500">Devis AI</span>
        </p>
      </div>
    </div>
  );
}

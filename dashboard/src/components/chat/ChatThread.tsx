import { useEffect, useRef, type ReactNode } from 'react';
import { Bot, Loader2, Send } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { ChatMsg, QuoteResult } from '@/lib/chat-engine';

// Liste des messages + saisie.
export function ChatThread({
  messages,
  busy,
  input,
  onInput,
  onSend,
  starters,
  renderAfterBot,
  footer,
}: {
  messages: ChatMsg[];
  busy: boolean;
  input: string;
  onInput: (v: string) => void;
  onSend: (text: string) => void;
  starters?: string[];
  renderAfterBot?: (msg: ChatMsg) => ReactNode; // ex. badge debug
  footer?: ReactNode; // ex. bouton « Générer mon devis »
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const noUserYet = messages.filter((m) => m.role === 'user').length === 0;

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'bot' ? 'flex flex-col gap-2' : ''}`}>
              {msg.role === 'bot' && (
                <div className="flex items-end gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--chat-accent-soft)] text-[var(--chat-accent)]">
                    <Bot className="size-3.5" />
                  </span>
                  <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
                    {msg.loading ? <TypingDots /> : <BotText content={msg.content} />}
                  </div>
                </div>
              )}
              {msg.role === 'bot' && msg.quote && <QuoteCard quote={msg.quote} />}
              {renderAfterBot && msg.role === 'bot' && !msg.loading && renderAfterBot(msg)}
              {msg.role === 'user' && (
                <div className="rounded-2xl rounded-br-sm bg-[var(--chat-accent)] px-3.5 py-2.5 text-sm text-white">
                  {msg.content}
                </div>
              )}
              {msg.role === 'bot' && !msg.loading && msg.buttons && msg.buttons.length > 0 && (
                <div className="ml-9 flex flex-wrap gap-2">
                  {msg.buttons.map((btn) => (
                    <button
                      key={btn}
                      onClick={() => onSend(btn)}
                      disabled={busy}
                      className="rounded-full border border-[var(--chat-accent-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--chat-accent)] shadow-sm transition-colors hover:bg-[var(--chat-accent-soft)] disabled:opacity-50"
                    >
                      {btn}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {footer}

      {starters && starters.length > 0 && noUserYet && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 pt-3">
          {starters.map((s) => (
            <button
              key={s}
              onClick={() => onSend(s)}
              disabled={busy}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-[var(--chat-accent-border)] hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-accent)] disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-slate-200 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => onInput(e.target.value)}
            placeholder="Écrivez votre question…"
            disabled={busy}
            className="flex-1 rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[var(--chat-accent)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-soft)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--chat-accent)] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      </div>
    </>
  );
}

export function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  );
}

// Rendu léger du gras **texte** (le bot n'utilise pas de markdown complet).
export function BotText({ content }: { content: string }) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="text-sm leading-relaxed text-slate-800">
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
      )}
    </p>
  );
}

// Carte devis affichée dans le fil quand /chat/quote renvoie un chiffrage.
function QuoteCard({ quote }: { quote: QuoteResult }) {
  return (
    <div className="ml-9 overflow-hidden rounded-xl border border-[var(--chat-accent-border)] bg-white shadow-sm">
      <div className="flex items-center justify-between bg-[var(--chat-accent-soft)] px-3.5 py-2">
        <span className="text-xs font-semibold text-[var(--chat-accent)]">Devis estimatif {quote.reference}</span>
        <span className="text-sm font-bold text-slate-900">{formatCurrency(quote.total)} TTC</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {quote.lines.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-slate-700">
              {l.label} · {l.quantity} {l.unit}
            </span>
            <span className="shrink-0 font-medium text-slate-900">{formatCurrency(l.line_total)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between px-3.5 py-2 text-xs text-slate-500">
        <span>Total HT {formatCurrency(quote.subtotal)} · TVA {Math.round(quote.tax_rate)}%</span>
      </div>
    </div>
  );
}

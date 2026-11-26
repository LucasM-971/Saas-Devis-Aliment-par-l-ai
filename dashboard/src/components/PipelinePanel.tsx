import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { computeQuoteTotals } from '@/lib/quote-math';
import { formatCurrency } from '@/lib/format';
import { STATUS_META, STATUS_ORDER } from '@/lib/quote-status';
import type { Quote, QuoteStatus } from '@/types';

export const STATUS_DOT: Record<QuoteStatus, string> = {
  brouillon: 'bg-slate-300',
  en_attente: 'bg-amber-400',
  pret: 'bg-brand-600',
  envoye: 'bg-slate-500',
  accepte: 'bg-emerald-600',
  refuse: 'bg-rose-400',
  expire: 'bg-slate-400',
};

// Répartition du montant TTC des devis par statut : une barre empilée + la liste.
export function PipelinePanel({ quotes }: { quotes: Quote[] }) {
  const rows = STATUS_ORDER.map((status) => {
    const items = quotes.filter((q) => q.status === status);
    const amount = items.reduce((sum, q) => sum + computeQuoteTotals(q).total, 0);
    return { status, count: items.length, amount };
  }).filter((r) => r.count > 0);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <Card padded={false} className="flex flex-col">
      <div className="border-b border-slate-100 px-4 py-3.5 sm:px-5 sm:py-4">
        <h2 className="text-base font-medium text-slate-900">Par statut</h2>
        <p className="mt-1 text-2xl font-medium tabular-nums text-slate-900">{formatCurrency(total)}</p>
      </div>
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100">
          {total > 0 &&
            rows.map((r) => (
              <span
                key={r.status}
                className={STATUS_DOT[r.status]}
                style={{ width: `${(r.amount / total) * 100}%` }}
                title={STATUS_META[r.status].label}
              />
            ))}
        </div>
      </div>
      <ul className="flex flex-col px-3 py-3">
        {rows.map((r) => (
          <li key={r.status}>
            <Link
              to={`/app/quotes?status=${r.status}`}
              className="flex h-9 items-center gap-2 rounded-lg px-2 text-sm transition-colors hover:bg-slate-50"
            >
              <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[r.status]}`} />
              <span className="min-w-0 flex-1 truncate text-slate-600">{STATUS_META[r.status].label}</span>
              <span className="w-6 text-right font-mono text-xs text-slate-400">{r.count}</span>
              <span className="text-right font-medium whitespace-nowrap tabular-nums text-slate-900">
                {formatCurrency(r.amount)}
              </span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="px-2 py-4 text-sm text-slate-400">Aucun devis</li>}
      </ul>
    </Card>
  );
}

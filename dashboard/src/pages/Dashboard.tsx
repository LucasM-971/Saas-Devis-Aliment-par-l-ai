import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QuoteFormModal } from '@/components/QuoteFormModal';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { ErrorState, LoadingState } from '@/components/AsyncStates';
import { StatCard } from '@/components/StatCard';
import { PipelinePanel, STATUS_DOT } from '@/components/PipelinePanel';
import { STATUS_META } from '@/lib/quote-status';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { computeQuoteTotals } from '@/lib/quote-math';
import { formatCurrency, formatDate, formatPercent } from '@/lib/format';
import type { Quote } from '@/types';

type Stats = {
  demandesEnAttente: number;
  pretAValider: number;
  montantPotentiel: number;
  tauxCompletion: number;
};

export default function Dashboard() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { activeMembership } = useAuth();
  const statsQuery = useApi<Stats>('/api/v1/stats');
  const quotesQuery = useApi<Quote[]>('/api/v1/quotes');
  const stats = statsQuery.data ?? {
    demandesEnAttente: 0,
    pretAValider: 0,
    montantPotentiel: 0,
    tauxCompletion: 0,
  };
  const recent = (quotesQuery.data ?? []).slice(0, 5);

  if (statsQuery.loading || quotesQuery.loading) {
    return <LoadingState label="Chargement de votre activité…" />;
  }
  if (statsQuery.error || quotesQuery.error) {
    return (
      <ErrorState
        message={statsQuery.error ?? quotesQuery.error}
        onRetry={() => {
          statsQuery.refetch();
          quotesQuery.refetch();
        }}
      />
    );
  }

  const priority =
    stats.pretAValider > 0
      ? { cta: `Valider ${stats.pretAValider} devis`, to: '/app/quotes?status=pret' }
      : stats.demandesEnAttente > 0
        ? { cta: `Traiter ${stats.demandesEnAttente} demandes`, to: '/app/quotes?status=en_attente' }
        : { cta: '', to: '' };

  return (
    <>
      <PageHeader
        title={activeMembership?.company.name ?? 'Accueil'}
        action={
          priority.to && (
            <Link
              to={priority.to}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              {priority.cta} <ArrowRight className="size-4" />
            </Link>
          )
        }
      />

      <OnboardingChecklist />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Demandes en attente"
          value={String(stats.demandesEnAttente)}
          to="/app/quotes?status=en_attente"
        />
        <StatCard
          label="À valider"
          value={String(stats.pretAValider)}
          to="/app/quotes?status=pret"
        />
        <StatCard
          label="En cours TTC"
          value={formatCurrency(stats.montantPotentiel)}
          to="/app/quotes"
        />
        <StatCard
          label="Acceptés"
          value={formatPercent(stats.tauxCompletion)}
          to="/app/quotes"
        />
      </div>

      {/* Derniers devis */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:mt-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <Card className="min-w-0" padded={false}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5 sm:py-4">
          <h2 className="text-base font-medium text-slate-900">Derniers devis</h2>
          <Link
            to="/app/quotes"
            className="group flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Voir tout
            <ArrowRight className="size-4" />
          </Link>
        </div>
        {recent.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            Aucun devis
          </p>
        )}
        <ul className="divide-y divide-slate-100 sm:hidden">
          {recent.map((quote) => (
            <li key={quote.id}>
              <button
                type="button"
                onClick={() => setOpenId(quote.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{quote.clientName}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[quote.status]}`} />
                    <span className="truncate">
                      {STATUS_META[quote.status].label} · {formatDate(quote.createdAt)}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-slate-900">
                  {formatCurrency(computeQuoteTotals(quote).total)}
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="bg-slate-50/60 text-left text-xs font-medium text-slate-500">
                <th className="hidden px-4 py-2.5 font-medium 2xl:table-cell">Référence</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Date</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5 text-right font-medium">Montant TTC</th>
                <th className="w-8 py-2.5 pr-4" />
              </tr>
            </thead>
            <tbody>
              {recent.map((quote) => (
                <tr
                  key={quote.id}
                  onClick={() => setOpenId(quote.id)}
                  className="group cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="hidden px-4 py-3 font-mono 2xl:table-cell text-xs text-slate-500">{quote.reference}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{quote.clientName}</td>
                  <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">{formatDate(quote.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 whitespace-nowrap text-slate-600"><span className={`size-2 rounded-full ${STATUS_DOT[quote.status]}`} />{STATUS_META[quote.status].label}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-base tabular-nums font-medium text-slate-900">
                    {formatCurrency(computeQuoteTotals(quote).total)}
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="size-4 text-slate-300 transition-colors group-hover:text-slate-500" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <PipelinePanel quotes={quotesQuery.data ?? []} />
      </div>
      <QuoteFormModal
        open={openId !== null}
        quote={(quotesQuery.data ?? []).find((q) => q.id === openId) ?? null}
        onClose={() => setOpenId(null)}
        onSaved={() => { quotesQuery.refetch(); statsQuery.refetch(); }}
      />
    </>
  );
}

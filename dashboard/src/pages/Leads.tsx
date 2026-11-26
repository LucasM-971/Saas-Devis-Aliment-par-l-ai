import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Inbox, MessageSquareText, TrendingUp, Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { QuoteByIdModal } from '@/components/QuoteByIdModal';
import { ConversationModal } from '@/components/chat/ConversationModal';
import { SearchInput } from '@/components/SearchInput';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState, LoadingState } from '@/components/AsyncStates';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { computeLeadStats, filterLeads, isConverted, type LeadFilter } from '@/lib/leads';
import { formatDate, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Lead } from '@/types';

const FILTERS: { id: LeadFilter; label: string }[] = [
  { id: 'tous', label: 'Tous' },
  { id: 'a_traiter', label: 'À traiter' },
  { id: 'convertis', label: 'Convertis' },
];

export default function Leads() {
  const { data, loading, error, refetch } = useApi<Lead[]>('/api/v1/leads');
  const leads = useMemo(() => data ?? [], [data]);
  const [filter, setFilter] = useState<LeadFilter>('tous');
  const [search, setSearch] = useState('');
  const [transcript, setTranscript] = useState<Lead | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertError, setConvertError] = useState('');
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);
  const closeQuote = useCallback(() => setOpenQuoteId(null), []);

  const stats = useMemo(() => computeLeadStats(leads), [leads]);
  const visible = useMemo(
    () =>
      [...filterLeads(leads, filter, search)].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    [leads, filter, search],
  );

  // Crée un devis brouillon puis l'ouvre
  const convert = async (id: string) => {
    setConvertingId(id);
    setConvertError('');
    try {
      const updated = await api.post<Lead>(`/api/v1/leads/${id}/convert`);
      refetch();
      if (updated.quoteId) setOpenQuoteId(updated.quoteId);
    } catch (e) {
      setConvertError((e as Error).message);
    } finally {
      setConvertingId(null);
    }
  };

  const openQuote = (lead: Lead) => {
    if (lead.quoteId) setOpenQuoteId(lead.quoteId);
  };

  if (loading) return <LoadingState label="Chargement des prospects…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Prospects"
        subtitle="Les demandes reçues via votre widget et autres canaux."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={Users} tone="brand" label="Total prospects" value={String(stats.total)} />
        <StatCard icon={Inbox} tone="amber" label="À traiter" value={String(stats.aTraiter)} />
        <StatCard
          icon={CheckCircle2}
          tone="green"
          label="Convertis"
          value={String(stats.convertis)}
        />
        <StatCard
          icon={TrendingUp}
          tone="blue"
          label="Taux de conversion"
          value={formatPercent(stats.tauxConversion)}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              filter === id
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {convertError && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {convertError}
        </p>
      )}

      <Card className="mt-4" padded={false}>
        <div className="border-b border-slate-100 p-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher un nom ou un email…"
            className="max-w-sm"
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Aucun prospect"
            description="Aucun prospect ne correspond à votre recherche."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2.5 sm:px-5 font-medium">Prospect</th>
                  <th className="hidden px-3 py-2.5 sm:px-5 font-medium lg:table-cell">Téléphone</th>
                  <th className="hidden px-3 py-2.5 sm:px-5 font-medium xl:table-cell">Source</th>
                  <th className="hidden px-3 py-2.5 sm:px-5 font-medium md:table-cell">Reçu le</th>
                  <th className="hidden px-3 py-2.5 sm:px-5 font-medium sm:table-cell">Statut</th>
                  <th className="px-3 py-2.5 sm:px-5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((lead) => (
                  <tr key={lead.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-3 sm:px-5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="font-medium text-slate-700">{lead.name}</p>
                        {lead.conversationId && (
                          <button
                            type="button"
                            title="Voir la conversation"
                            onClick={() => setTranscript(lead)}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                          >
                            <MessageSquareText className="size-3.5" />
                            Chat
                          </button>
                        )}
                      </div>
                      <p className="break-all text-xs text-slate-400">{lead.email}</p>
                      {lead.phone && <p className="text-xs text-slate-400 lg:hidden">{lead.phone}</p>}
                    </td>
                    <td className="hidden px-3 py-3 text-slate-500 sm:px-5 lg:table-cell">{lead.phone ?? '—'}</td>
                    <td className="hidden px-3 py-3 text-slate-500 sm:px-5 xl:table-cell">{lead.source}</td>
                    <td className="hidden px-3 py-3 text-slate-500 sm:px-5 md:table-cell">{formatDate(lead.createdAt)}</td>
                    <td className="hidden px-3 py-3 sm:table-cell sm:px-5">
                      {isConverted(lead) ? (
                        <Badge tone="green">Converti</Badge>
                      ) : (
                        <Badge tone="amber">À traiter</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 sm:px-5 text-right">
                      {isConverted(lead) ? (
                        <button
                          type="button"
                          title="Ouvrir le devis pour le suivi"
                          onClick={() => openQuote(lead)}
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                        >
                          <FileText className="size-4" />
                          Suivre le devis
                        </button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => convert(lead.id)}
                          loading={convertingId === lead.id}
                        >
                          Créer un devis
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <QuoteByIdModal quoteId={openQuoteId} onClose={closeQuote} onSaved={refetch} />

      {transcript?.conversationId && (
        <ConversationModal
          conversationId={transcript.conversationId}
          title={`Conversation — ${transcript.name}`}
          subtitle="Prospect capté via le widget"
          onClose={() => setTranscript(null)}
        />
      )}
    </>
  );
}

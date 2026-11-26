import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, Euro, FileText, MessageSquareText, Plus, Sparkles, TrendingUp, Upload, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { QuoteFormModal } from '@/components/QuoteFormModal';
import { ConversationModal } from '@/components/chat/ConversationModal';
import { SearchInput } from '@/components/SearchInput';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState, LoadingState } from '@/components/AsyncStates';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { countByStatus, filterQuotes, type QuoteFilter } from '@/lib/quotes';
import { computeDashboardStats } from '@/lib/stats';
import { computeQuoteTotals } from '@/lib/quote-math';
import { STATUS_META, STATUS_ORDER } from '@/lib/quote-status';
import { formatCurrency, formatDate, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Quote, QuoteDraft, QuoteStatus } from '@/types';

// Formats acceptés à l'import (le serveur retombe sur du texte brut au besoin).
const IMPORT_ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

export default function Quotes() {
  const { data, loading, error, refetch } = useApi<Quote[]>('/api/v1/quotes');
  const quotes = useMemo(() => data ?? [], [data]);
  const [filter, setFilter] = useState<QuoteFilter>('tous');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Quote | null>(null);
  const [creating, setCreating] = useState(false);
  const [importedDraft, setImportedDraft] = useState<QuoteDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sampling, setSampling] = useState(false);
  const [sampleError, setSampleError] = useState('');
  const [params, setParams] = useSearchParams();

  // Importe un devis exemple et l'ouvre via ?quote=
  const importSample = async () => {
    setSampling(true);
    setSampleError('');
    try {
      const created = await api.post<Quote>('/api/v1/quotes/sample');
      setParams({ quote: created.id }, { replace: true });
      refetch();
    } catch (e) {
      setSampleError((e as Error).message);
    } finally {
      setSampling(false);
    }
  };

  // Liens profonds : ?new=1, ?status=, ?quote=
  useEffect(() => {
    if (params.get('new') === '1') {
      setCreating(true);
      setParams({}, { replace: true });
      return;
    }
    const status = params.get('status');
    if (status && STATUS_ORDER.includes(status as QuoteStatus)) {
      setFilter(status as QuoteStatus);
      setParams({}, { replace: true });
      return;
    }
    const quoteId = params.get('quote');
    if (quoteId && quotes.some((q) => q.id === quoteId)) {
      setSelectedId(quoteId);
      setParams({}, { replace: true });
    }
  }, [params, setParams, quotes]);

  const stats = useMemo(() => computeDashboardStats(quotes), [quotes]);
  const counts = useMemo(() => countByStatus(quotes), [quotes]);
  const visible = useMemo(
    () =>
      [...filterQuotes(quotes, filter, search)].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    [quotes, filter, search],
  );
  const selected = quotes.find((q) => q.id === selectedId) ?? null;

  // Importe un fichier (PDF/DOCX/texte) → brouillon extrait → formulaire pré-rempli.
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // autorise le ré-import du même fichier
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const draft = await api.upload<QuoteDraft>('/api/v1/quotes/import', file);
      setImportedDraft(draft);
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const closeModal = () => {
    setCreating(false);
    setSelectedId(null);
    setImportedDraft(null);
  };

  if (loading) return <LoadingState label="Chargement des devis…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Devis"
        subtitle="Suivez, validez et envoyez vos devis."
        action={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept={IMPORT_ACCEPT}
              className="hidden"
              onChange={onImportFile}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              loading={importing}
              title="Importer un devis existant (PDF, DOCX ou texte)"
            >
              <Upload className="size-4" />
              Importer
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={importSample}
              loading={sampling}
              title="Créer un brouillon d'exemple, prêt à modifier"
            >
              <Sparkles className="size-4" />
              Importer un exemple
            </Button>
            <Button size="sm" className="col-span-2" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Nouveau devis
            </Button>
          </div>
        }
      />

      {importError && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>Import impossible : {importError}</span>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setImportError(null)}
            className="shrink-0 text-rose-400 hover:text-rose-600"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {sampleError && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{sampleError}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={FileText} tone="brand" label="Total devis" value={String(quotes.length)} />
        <StatCard
          icon={Clock}
          tone="amber"
          label="En attente"
          value={String(stats.demandesEnAttente)}
        />
        <StatCard
          icon={Euro}
          tone="blue"
          label="Montant en cours"
          value={formatCurrency(stats.montantPotentiel)}
          hint="Devis non clos (TTC)"
        />
        <StatCard
          icon={TrendingUp}
          tone="green"
          label="Taux d'acceptation"
          value={formatPercent(stats.tauxCompletion)}
        />
      </div>

      {/* Filtres par statut */}
      <div className="mt-6 flex flex-wrap gap-2">
        <FilterChip active={filter === 'tous'} onClick={() => setFilter('tous')}>
          Tous <span className="text-slate-400">{quotes.length}</span>
        </FilterChip>
        {STATUS_ORDER.map((status) => (
          <FilterChip
            key={status}
            active={filter === status}
            onClick={() => setFilter(status)}
          >
            {STATUS_META[status].label} <span className="text-slate-400">{counts[status]}</span>
          </FilterChip>
        ))}
      </div>

      <Card className="mt-4" padded={false}>
        <div className="border-b border-slate-100 p-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher une référence ou un client…"
            className="max-w-sm"
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucun devis"
            description="Aucun devis ne correspond à votre recherche."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="hidden px-3 py-2.5 sm:table-cell sm:px-5 font-medium">Référence</th>
                  <th className="px-3 py-2.5 sm:px-5 font-medium">Client</th>
                  <th className="hidden px-3 py-2.5 xl:table-cell sm:px-5 font-medium">Date</th>
                  <th className="hidden px-3 py-2.5 sm:table-cell sm:px-5 font-medium">Statut</th>
                  <th className="px-3 py-2.5 sm:px-5 text-right font-medium">Montant TTC</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((quote) => (
                  <tr
                    key={quote.id}
                    onClick={() => setSelectedId(quote.id)}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/60"
                  >
                    <td className="hidden px-3 py-3 font-medium text-slate-700 sm:table-cell sm:px-5">{quote.reference}</td>
                    <td className="px-3 py-3 sm:px-5 text-slate-600">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0">
                          <span className="block truncate">{quote.clientName}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400 sm:hidden">
                            <StatusBadge status={quote.status} />
                            {quote.reference}
                          </span>
                        </span>
                        {quote.conversationId && (
                          <button
                            type="button"
                            title="Voir la conversation"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTranscript(quote);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                          >
                            <MessageSquareText className="size-3.5" />
                            Chat
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 text-slate-500 sm:px-5 xl:table-cell">{formatDate(quote.createdAt)}</td>
                    <td className="hidden px-3 py-3 sm:table-cell sm:px-5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={quote.status} />
                        {quote.emailStatus === 'failed' && (
                          <span
                            title="Le dernier envoi e-mail a échoué — rouvrez le devis et réessayez."
                            className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600"
                          >
                            e-mail échoué
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 sm:px-5 text-right font-medium whitespace-nowrap tabular-nums text-slate-700">
                      {formatCurrency(computeQuoteTotals(quote).total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <QuoteFormModal
        open={creating || selectedId !== null || importedDraft !== null}
        quote={creating || importedDraft ? null : selected}
        draft={importedDraft}
        onClose={closeModal}
        onSaved={refetch}
      />

      {transcript?.conversationId && (
        <ConversationModal
          conversationId={transcript.conversationId}
          title={`Conversation — ${transcript.clientName || transcript.reference}`}
          subtitle={`Devis ${transcript.reference}`}
          onClose={() => setTranscript(null)}
        />
      )}
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-brand-200 bg-brand-50 text-brand-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}


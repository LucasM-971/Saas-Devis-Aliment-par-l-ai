import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState, LoadingState } from '@/components/AsyncStates';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { AUDIT_TYPE_META, groupAuditByDay } from '@/lib/audit';
import { cn } from '@/lib/cn';
import type { AuditEntry, AuditType } from '@/types';

// Taille de page côté API (le journal grossit indéfiniment).
const PAGE_SIZE = 100;

const TYPE_FILTERS: { id: AuditType | 'tous'; label: string }[] = [
  { id: 'tous', label: 'Tout' },
  { id: 'quote', label: 'Devis' },
  { id: 'ai', label: 'IA' },
  { id: 'lead', label: 'Prospects' },
  { id: 'pricing', label: 'Tarifs' },
  { id: 'member', label: 'Équipe' },
];

export default function Audit() {
  const [type, setType] = useState<AuditType | 'tous'>('tous');
  const [search, setSearch] = useState('');

  // Pages accumulées : le bouton « Charger plus » ajoute la suivante.
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadPage = useCallback(async (offset: number) => {
    const page = await api.get<AuditEntry[]>(`/api/v1/audit?limit=${PAGE_SIZE}&offset=${offset}`);
    setEntries((prev) => (offset === 0 ? page : [...prev, ...page]));
    setHasMore(page.length === PAGE_SIZE);
  }, []);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    loadPage(0)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [loadPage]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await loadPage(entries.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      if (type !== 'tous' && entry.type !== type) return false;
      if (!needle) return true;
      return (
        entry.actor.toLowerCase().includes(needle) ||
        entry.action.toLowerCase().includes(needle) ||
        entry.target.toLowerCase().includes(needle)
      );
    });
    return groupAuditByDay(filtered);
  }, [entries, type, search]);

  if (loading) return <LoadingState label="Chargement du journal…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Journal d'activité"
        subtitle="L'historique des actions sur votre espace."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setType(id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              type === id
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {label}
          </button>
        ))}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher…"
          className="ml-auto w-full max-w-xs"
        />
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={ScrollText}
            title="Aucune activité"
            description="Aucun événement ne correspond à votre recherche."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key}>
              <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                {group.label}
              </p>
              <Card padded={false}>
                <ul className="divide-y divide-slate-100">
                  {group.entries.map((entry) => {
                    const meta = AUDIT_TYPE_META[entry.type];
                    const Icon = meta.icon;
                    return (
                      <li key={entry.id} className="flex items-center gap-3 px-5 py-3.5">
                        <span
                          className={cn(
                            'grid size-9 shrink-0 place-items-center rounded-full',
                            TONE_STYLES[meta.tone],
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <p className="text-sm text-slate-600">
                          <span className="font-medium text-slate-900">{entry.actor}</span>{' '}
                          {entry.action}{' '}
                          <span className="font-medium text-slate-700">{entry.target}</span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
            Charger plus d'événements
          </Button>
        </div>
      )}
    </>
  );
}

// Pastilles d'icône par couleur (alignées sur les tons des badges).
const TONE_STYLES: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  slate: 'bg-slate-100 text-slate-500',
  rose: 'bg-rose-50 text-rose-600',
};

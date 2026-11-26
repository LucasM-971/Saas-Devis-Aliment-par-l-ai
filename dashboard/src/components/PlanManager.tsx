import { useState } from 'react';
import { Check, Crown, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { PlanInfo } from '@/types';

// Libellés des fonctionnalités premium affichés sur la page Abonnement.
const FEATURE_LABELS: Record<string, string> = {
  unlimited_quotes: 'Devis illimités (10/mois en gratuit)',
  quote_customization: 'Personnalisation du modèle de devis (logo, couleurs, mise en page)',
  multi_company: 'Plusieurs espaces entreprise',
};

// Gestion réelle de l'abonnement de l'entreprise active (plan, quota, changement).
// Branché sur /api/v1/billing/plan ; le changement est réservé au propriétaire.
export function PlanManager() {
  const { activeMembership, refreshSession } = useAuth();
  const { data: plan, loading, error, refetch } = useApi<PlanInfo>('/api/v1/billing/plan');
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState('');
  const isOwner = activeMembership?.role === 'owner';

  const changePlan = async (target: 'free' | 'premium') => {
    setChanging(true);
    setChangeError('');
    try {
      await api.post('/api/v1/billing/plan', { plan: target });
      await refreshSession();
      refetch();
    } catch (e) {
      setChangeError((e as Error).message);
    } finally {
      setChanging(false);
    }
  };

  if (loading) return <p className="py-10 text-center text-sm text-slate-400">Chargement…</p>;
  if (error || !plan)
    return <p className="py-10 text-center text-sm text-rose-600">Impossible de charger l'abonnement.</p>;

  const isPremium = plan.plan === 'premium';
  const { used, limit } = plan.quoteQuota;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Plan {isPremium ? 'Premium' : 'Gratuit'}
              </h2>
              {isPremium ? (
                <Badge tone="brand">
                  <Crown className="size-3" /> Premium
                </Badge>
              ) : (
                <Badge tone="slate">Gratuit</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {isPremium
                ? 'Toutes les fonctionnalités sont débloquées pour cette entreprise.'
                : 'Passez au plan Premium pour débloquer toutes les fonctionnalités.'}
            </p>
          </div>
        </div>

        {/* Quota de devis du mois */}
        <div className="mt-5 rounded-lg bg-slate-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">Devis créés ce mois-ci</span>
            <span className="tabular-nums text-slate-500">
              {used}
              {limit !== null ? ` / ${limit}` : ' · illimité'}
            </span>
          </div>
          {limit !== null && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={cn('h-full rounded-full', used >= limit ? 'bg-rose-500' : 'bg-brand-600')}
                style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Fonctionnalités */}
        <ul className="mt-5 space-y-2.5">
          {Object.entries(FEATURE_LABELS).map(([key, label]) => {
            const enabled = plan.features[key];
            return (
              <li key={key} className="flex items-center gap-2.5 text-sm">
                <span
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full',
                    enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400',
                  )}
                >
                  {enabled ? <Check className="size-3" /> : <Crown className="size-3" />}
                </span>
                <span className={enabled ? 'text-slate-700' : 'text-slate-400'}>{label}</span>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          {isPremium ? (
            <Button
              variant="secondary"
              onClick={() => changePlan('free')}
              loading={changing}
              disabled={!isOwner}
            >
              Repasser en gratuit
            </Button>
          ) : (
            <Button onClick={() => changePlan('premium')} loading={changing} disabled={!isOwner}>
              <Sparkles className="size-4" />
              Passer au plan Premium
            </Button>
          )}
          {!isOwner && (
            <span className="text-xs text-slate-400">
              Seul le propriétaire peut changer d'abonnement.
            </span>
          )}
          {changeError && <span className="text-sm text-rose-600">{changeError}</span>}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Le paiement en ligne (Stripe) arrive bientôt : le changement de plan est immédiat et sans
          facturation pendant la bêta.
        </p>
      </Card>
    </div>
  );
}

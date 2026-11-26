import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';

type OnboardingStatus = {
  hasMetier: boolean;
  hasCatalog: boolean;
  hasZones: boolean;
  hasAssistant: boolean;
  hasQuote: boolean;
  complete: boolean;
};

const STEPS: { key: keyof OnboardingStatus; label: string; to: string }[] = [
  { key: 'hasMetier', label: 'Choisir votre métier', to: '/app/settings?tab=catalogue' },
  { key: 'hasCatalog', label: 'Vérifier votre grille tarifaire', to: '/app/settings?tab=catalogue' },
  { key: 'hasZones', label: "Définir votre zone d'intervention", to: '/app/settings?tab=catalogue' },
  { key: 'hasAssistant', label: 'Publier votre assistant', to: '/app/chat' },
  { key: 'hasQuote', label: 'Recevoir votre premier devis', to: '/app/chat?tab=share' },
];

// Checklist affichée tant que l'entreprise n'est pas prête.
export function OnboardingChecklist() {
  const { data } = useApi<OnboardingStatus>('/api/v1/onboarding');
  if (!data || (data.complete && data.hasQuote)) return null;

  const done = STEPS.filter((s) => data[s.key]).length;

  return (
    <Card className="mb-5 max-sm:p-4 sm:mb-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">
              Démarrage {done}/{STEPS.length}
            </p>
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-[width]"
                style={{ width: `${(done / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {STEPS.map(({ key, label, to }) => {
              const ok = data[key];
              return (
                <li key={key}>
                  <Link
                    to={to}
                    className={cn(
                      'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                      ok ? 'text-slate-400' : 'text-slate-700 hover:bg-slate-100',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded-full border',
                        ok
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                          : 'border-slate-200 bg-white text-transparent',
                      )}
                    >
                      <Check className="size-3" />
                    </span>
                    <span className={cn('truncate', ok && 'line-through')}>{label}</span>
                    {!ok && (
                      <ArrowRight className="ml-auto size-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Card>
  );
}

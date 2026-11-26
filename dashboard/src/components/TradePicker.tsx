import { TRADES, type TradeId } from '@/lib/trades';
import { cn } from '@/lib/cn';

type Props = {
  value: TradeId | null;
  onChange: (id: TradeId) => void;
  /** Nombre de colonnes à partir du breakpoint sm (défaut 2). */
  columns?: 2 | 3;
};

// Choix du métier (Réglages et onboarding).
export function TradePicker({ value, onChange, columns = 2 }: Props) {
  return (
    <div className={cn('grid gap-2.5', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {TRADES.map((t) => {
        const Icon = t.icon;
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t.id)}
            className={cn(
              'flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors',
              active ? t.tint.active : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', t.tint.icon)}>
              <Icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800">{t.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{t.tagline}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

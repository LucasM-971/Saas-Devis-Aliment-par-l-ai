import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';

type Props = {
  icon?: unknown;
  tone?: string;
  label: string;
  value: string;
  hint?: string;
  to?: string;
};

// Rend les séparateurs de milliers sécables pour que les gros montants coupent
// proprement aux frontières de groupes (« 13 / 714,00 € ») plutôt qu'en plein
// chiffre. U+202F (espace fine insécable, séparateur de milliers fr-FR) → espace
// normale sécable ; l'espace avant le symbole monétaire (U+00A0) reste intacte.
function breakableNumber(value: string): string {
  return value.replace(/\u202F/g, ' ');
}

// Tuile d'indicateur, statique par défaut, actionnable (lien) quand `to` est fourni.
export function StatCard({ label, value, hint, to }: Props) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
        <p className="mt-1 text-xl sm:text-2xl font-medium leading-tight tabular-nums text-slate-900">
          {breakableNumber(value)}
        </p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
      {to && (
        <ChevronRight className="absolute bottom-4 right-4 size-4 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </>
  );

  if (!to) {
    return <Card className="flex items-start justify-between max-sm:p-4">{body}</Card>;
  }

  // Reprend le style de Card sur un Link pour une tuile cliquable et tactile.
  return (
    <Link
      to={to}
      className="group relative flex items-start justify-between rounded-card border border-slate-200 bg-surface p-4 shadow-card sm:p-5 transition-colors hover:border-slate-300"
    >
      {body}
    </Link>
  );
}

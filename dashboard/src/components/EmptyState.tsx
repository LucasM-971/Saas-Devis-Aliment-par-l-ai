import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = { icon: LucideIcon; title: string; description?: string; action?: ReactNode };

// État vide générique pour les listes (aucun résultat / aucune donnée).
export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="size-6" />
      </span>
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action}
    </div>
  );
}

import type { ReactNode } from 'react';

type Props = { title: string; subtitle?: string; action?: ReactNode };

// En-tête de page homogène (titre + sous-titre + action optionnelle).
export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-medium text-slate-900 sm:text-xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 whitespace-nowrap max-sm:[&>*]:w-full max-sm:[&>*]:justify-center">{action}</div>}
    </div>
  );
}

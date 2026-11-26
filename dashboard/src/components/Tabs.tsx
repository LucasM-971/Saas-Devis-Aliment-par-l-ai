import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type Tab = { id: string; label: string; icon?: LucideIcon };

type Props = { tabs: Tab[]; active: string; onChange: (id: string) => void; className?: string };

// Navigation par onglets soulignés (style « tabs » horizontal).
export function Tabs({ tabs, active, onChange, className }: Props) {
  return (
    <div className={cn('-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 [scrollbar-width:none] sm:mx-0 sm:px-0', className)}>
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            id === active
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {Icon && <Icon className="size-4 shrink-0" />}
          {label}
        </button>
      ))}
    </div>
  );
}

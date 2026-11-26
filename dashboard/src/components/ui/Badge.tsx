import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'slate' | 'brand' | 'blue' | 'green' | 'amber' | 'rose';

const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-600',
  brand: 'bg-brand-50 text-brand-700',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
};

type Props = { tone?: Tone; className?: string; children: ReactNode };

export function Badge({ tone = 'slate', className, children }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

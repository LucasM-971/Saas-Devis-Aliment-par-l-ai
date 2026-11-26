import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type CardProps = HTMLAttributes<HTMLDivElement> & { padded?: boolean };

export function Card({ className, padded = true, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-slate-200 bg-surface shadow-card',
        padded && 'p-5',
        className,
      )}
      {...props}
    />
  );
}

type CardHeaderProps = { title: ReactNode; subtitle?: ReactNode; action?: ReactNode };

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

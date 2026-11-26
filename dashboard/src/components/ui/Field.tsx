import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Props = {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
};

// Enveloppe label + contrôle + message d'erreur, pour un rendu de formulaire homogène.
export function Field({ label, htmlFor, required, error, hint, className, children }: Props) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

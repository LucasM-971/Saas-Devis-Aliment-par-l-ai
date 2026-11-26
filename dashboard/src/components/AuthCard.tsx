import type { ReactNode } from 'react';

type Props = { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode };

// Carte d'authentification homogène pour login / register / mot de passe…
export function AuthCard({ title, subtitle, children, footer }: Props) {
  return (
    <div className="w-full max-w-md rounded-card border border-slate-200 bg-surface p-8 shadow-pop">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
      {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
    </div>
  );
}

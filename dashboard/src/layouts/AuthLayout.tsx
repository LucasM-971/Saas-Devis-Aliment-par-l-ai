import { Outlet } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { PageTransition } from '@/components/PageTransition';

// Cadre des pages d'authentification : header logo, fond calme, carte centrée.
export default function AuthLayout() {
  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-brand-50/70 to-canvas">
      <header className="px-6 py-5">
        <Logo />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>

      <footer className="px-6 py-5 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Devis AI — Devis automatisés pour les pros.
      </footer>
    </div>
  );
}

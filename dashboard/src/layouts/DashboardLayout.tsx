import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PageTransition } from '@/components/PageTransition';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardLayout() {
  const { activeCompanyId } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const noScroll = useLocation().pathname.startsWith('/app/quote-template');

  // Menu mobile ouvert : Échap le ferme, passage en ≥lg aussi.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSidebarOpen(false);
    const mq = window.matchMedia('(min-width: 1024px)');
    const onMq = () => mq.matches && setSidebarOpen(false);
    window.addEventListener('keydown', onKey);
    mq.addEventListener('change', onMq);
    return () => {
      window.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onMq);
    };
  }, [sidebarOpen]);

  const toggleCollapsed = () =>
    setCollapsed((v) => {
      try {
        localStorage.setItem('sidebar-collapsed', v ? '0' : '1');
      } catch {
        /* stockage indisponible */
      }
      return !v;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* Overlay mobile derrière la sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <Sidebar
          open={sidebarOpen}
          collapsed={collapsed}
          onClose={() => setSidebarOpen(false)}
          onToggleCollapsed={toggleCollapsed}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar onMenuToggle={() => setSidebarOpen((v) => !v)} />
          <main className={`flex-1 ${noScroll ? 'lg:overflow-hidden overflow-y-auto' : 'overflow-y-auto'} px-4 py-4 sm:px-6 sm:py-6 xl:px-8`}>
            <div className="mx-auto max-w-6xl">
              {/* key = entreprise active : changer d'entreprise remonte la page et recharge ses données */}
              <PageTransition key={activeCompanyId ?? 'none'}>
                <Outlet />
              </PageTransition>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

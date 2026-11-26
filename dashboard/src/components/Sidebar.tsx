import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { NAV_ITEMS } from '@/lib/nav';
import { cn } from '@/lib/cn';

type Props = { open: boolean; collapsed: boolean; onClose: () => void; onToggleCollapsed: () => void };

export function Sidebar({ open, collapsed, onClose, onToggleCollapsed }: Props) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-[min(16rem,85vw)] shrink-0 lg:w-60 flex-col border-r border-slate-200 bg-surface transition-[transform,width] duration-200 select-none',
        collapsed && 'lg:w-16',
        'lg:relative lg:z-20 lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className={cn('flex h-14 shrink-0 items-center sm:h-16 justify-between px-5', collapsed && 'lg:justify-center lg:px-0')}>
        <NavLink to="/" onClick={onClose}>
          <Logo className="lg:hidden" />
          <Logo showText={!collapsed} className="hidden lg:inline-flex" />
        </NavLink>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
          onClick={onClose}
          aria-label="Fermer le menu"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                collapsed && 'lg:justify-center lg:px-0',
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'before:absolute before:inset-y-1.5 before:-left-1 before:w-[3px] before:rounded-full before:bg-brand-600 before:transition-opacity',
                isActive
                  ? 'bg-slate-100 text-slate-900 before:opacity-100'
                  : 'text-slate-600 before:opacity-0 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            <Icon className="size-[18px] shrink-0" />
            <span className={cn('truncate', collapsed && 'lg:hidden')}>{label}</span>
            {collapsed && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 lg:block"
              >
                {label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className={cn('flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-400', collapsed && 'lg:justify-center lg:px-0')}>
        <span className={cn(collapsed && 'lg:hidden')}>Devis AI · v0.1</span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="hidden size-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:grid"
          aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>
    </aside>
  );
}

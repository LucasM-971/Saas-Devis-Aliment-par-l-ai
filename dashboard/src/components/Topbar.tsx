import { useNavigate } from 'react-router-dom';
import { Building2, Check, ChevronDown, LogOut, Menu, Plus, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { useAuth } from '@/hooks/useAuth';

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

type Props = { onMenuToggle: () => void };

export function Topbar({ onMenuToggle }: Props) {
  const { user, memberships, activeMembership, switchCompany, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-surface px-3 sm:h-16 sm:gap-3 sm:px-6 select-none">
      {/* Hamburger — visible uniquement sur mobile */}
      <button
        type="button"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
        onClick={onMenuToggle}
        aria-label="Ouvrir le menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Sélecteur d'entreprise */}
      <Dropdown
        align="left"
        trigger={
          <span className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Building2 className="size-4 shrink-0 text-slate-400" />
            <span className="max-w-[7.5rem] truncate sm:max-w-[12rem]">
              {activeMembership?.company.name}
            </span>
            <ChevronDown className="size-4 shrink-0 text-slate-400" />
          </span>
        }
      >
        {(close) => (
          <>
            <p className="px-3 pb-1 pt-1.5 text-xs font-medium text-slate-400">Entreprises</p>
            {memberships.map((m) => (
              <DropdownItem
                key={m.company.id}
                active={m.company.id === activeMembership?.company.id}
                onClick={() => {
                  switchCompany(m.company.id);
                  close();
                }}
              >
                <Building2 className="size-4" />
                <span className="flex-1">{m.company.name}</span>
                {m.company.id === activeMembership?.company.id && <Check className="size-4" />}
              </DropdownItem>
            ))}
            <div className="my-1 h-px bg-slate-100" />
            <DropdownItem
              className="text-brand-600 hover:bg-brand-50"
              onClick={() => {
                close();
                navigate('/app/companies/new');
              }}
            >
              <Plus className="size-4" />
              Ajouter une entreprise
            </DropdownItem>
          </>
        )}
      </Dropdown>

      {/* Espace flexible */}
      <div className="flex-1" />

      {/* Actions droite */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Bouton texte sur sm+, icône seule sur xs */}
        <Button
          size="sm"
          className="hidden sm:inline-flex"
          onClick={() => navigate('/app/quotes?new=1')}
        >
          <Plus className="size-4" />
          Nouveau devis
        </Button>
        <Button
          size="sm"
          className="sm:hidden"
          onClick={() => navigate('/app/quotes?new=1')}
          aria-label="Nouveau devis"
        >
          <Plus className="size-4" />
        </Button>

        {/* Menu utilisateur */}
        <Dropdown
          trigger={
            <span className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-slate-100">
              <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {initials(user?.name ?? '?')}
              </span>
              <ChevronDown className="size-4 text-slate-400" />
            </span>
          }
        >
          {(close) => (
            <>
              <div className="px-3 py-2">
                <p className="text-sm font-medium text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-400">{user?.email}</p>
              </div>
              <div className="my-1 h-px bg-slate-100" />
              <DropdownItem
                onClick={() => {
                  close();
                  navigate('/app/settings');
                }}
              >
                <UserRound className="size-4" />
                Mon compte
              </DropdownItem>
              <DropdownItem
                className="text-rose-600 hover:bg-rose-50"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                <LogOut className="size-4" />
                Se déconnecter
              </DropdownItem>
            </>
          )}
        </Dropdown>
      </div>
    </header>
  );
}

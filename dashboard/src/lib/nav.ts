import { Bot, CreditCard, FileText, LayoutDashboard, Palette, ScrollText, Settings, UserCog, Users, type LucideIcon } from 'lucide-react';

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

// Navigation principale du dashboard.
export const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Accueil', icon: LayoutDashboard, end: true },
  { to: '/app/quotes', label: 'Devis', icon: FileText },
  { to: '/app/quote-template', label: 'Personnaliser le devis', icon: Palette },
  { to: '/app/leads', label: 'Prospects', icon: Users },
  { to: '/app/members', label: 'Membres', icon: UserCog },
  { to: '/app/audit', label: "Journal d'activité", icon: ScrollText },
  { to: '/app/chat', label: 'Chat AI', icon: Bot },
  { to: '/app/subscription', label: 'Abonnement', icon: CreditCard },
  { to: '/app/settings', label: 'Réglages', icon: Settings },
];

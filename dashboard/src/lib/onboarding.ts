import type { Membership } from '@/types';

// Seuls les propriétaires/administrateurs peuvent configurer l'entreprise
// (le PATCH /companies/current est réservé à ces rôles côté API).
const ADMIN_ROLES = new Set(['owner', 'admin']);

// Vrai quand l'entreprise active n'a pas encore de métier ET que l'utilisateur
// a le droit de le renseigner. Un membre simple d'une entreprise non configurée
// n'est jamais redirigé (il ne pourrait rien enregistrer) : il verra le
// tableau de bord, à charge pour un admin de terminer la configuration.
export function needsOnboarding(membership: Membership | null | undefined): boolean {
  if (!membership) return false;
  if (!ADMIN_ROLES.has(membership.role)) return false;
  return !membership.company.metier;
}

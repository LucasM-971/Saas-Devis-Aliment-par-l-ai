import type { Membership } from '@/types';

// Rôles autorisés à configurer l'entreprise.
const ADMIN_ROLES = new Set(['owner', 'admin']);

// Vrai si l'entreprise n'a pas de métier et que l'utilisateur peut le définir.
export function needsOnboarding(membership: Membership | null | undefined): boolean {
  if (!membership) return false;
  if (!ADMIN_ROLES.has(membership.role)) return false;
  return !membership.company.metier;
}

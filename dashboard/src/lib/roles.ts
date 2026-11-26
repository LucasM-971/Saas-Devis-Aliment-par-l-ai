import type { Tone } from '@/components/ui/Badge';
import type { Role } from '@/types';

// Libellé FR et couleur associés à chaque rôle d'équipe.
export const ROLE_META: Record<Role, { label: string; tone: Tone }> = {
  owner: { label: 'Propriétaire', tone: 'brand' },
  admin: { label: 'Administrateur', tone: 'blue' },
  member: { label: 'Membre', tone: 'slate' },
  viewer: { label: 'Lecture seule', tone: 'slate' },
};

// Rôles habilités à gérer l'équipe : inviter, changer un rôle, retirer un membre.
export function canManageMembers(role: Role | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

// Rôles attribuables depuis la gestion d'équipe. La propriété (owner) se transfère
// via une action dédiée : on ne la propose donc pas ici.
export const ASSIGNABLE_ROLES: Role[] = ['admin', 'member', 'viewer'];

import { createContext } from 'react';
import type { Company, Membership, User } from '@/types';

// Données saisies dans le formulaire « Ajouter une entreprise ».
export type NewCompanyInput = {
  name: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
};

export type AuthContextValue = {
  user: User | null;
  memberships: Membership[];
  activeCompanyId: string | null;
  activeMembership: Membership | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string }) => Promise<void>;
  // Compte propriétaire seedé, réservé au dev (bouton « Accès dev »).
  loginAsDev: () => Promise<void>;
  // Compte de démonstration public en lecture seule (parcours /demo).
  loginAsDemo: () => Promise<void>;
  logout: () => void;
  switchCompany: (companyId: string) => void;
  // Crée un nouvel espace entreprise via l'API et bascule dessus.
  addCompany: (input: NewCompanyInput) => Promise<Company>;
  // Recharge le profil /me (après modification de l'entreprise ou du profil).
  refreshSession: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

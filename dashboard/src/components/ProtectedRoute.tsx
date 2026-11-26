import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { needsOnboarding } from '@/lib/onboarding';

// Garde des routes applicatives :
//  1. non authentifié → connexion ;
//  2. entreprise active sans métier (owner/admin) → onboarding, sauf lorsqu'on
//     est déjà sur /onboarding (évite la boucle de redirection).
export function ProtectedRoute() {
  const { isAuthenticated, activeMembership } = useAuth();
  const { pathname } = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (needsOnboarding(activeMembership) && pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}

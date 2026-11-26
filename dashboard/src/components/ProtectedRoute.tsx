import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { needsOnboarding } from '@/lib/onboarding';

// Redirige vers la connexion si non connecté, ou vers l'onboarding sans métier.
export function ProtectedRoute() {
  const { isAuthenticated, activeMembership } = useAuth();
  const { pathname } = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (needsOnboarding(activeMembership) && pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}

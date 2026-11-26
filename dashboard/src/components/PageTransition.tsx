import { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Rejoue une animation d'entrée légère à chaque changement de page.
 * La clé sur le pathname force le remount du contenu → l'animation se relance.
 * Désactivée automatiquement via `prefers-reduced-motion` (cf. index.css).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}

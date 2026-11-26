import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// Parcours « Voir la démo » : connexion au compte de démonstration public
// (rôle viewer, lecture seule ; données réelles servies par l'API), puis
// redirection vers le dashboard.
export default function DemoEntry() {
  const { loginAsDemo } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loginAsDemo()
      .then(() => !cancelled && navigate('/app', { replace: true }))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [loginAsDemo, navigate]);

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 px-6 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-800">Démo indisponible</p>
          <p className="mt-1 text-sm text-slate-500">
            Le serveur de démonstration ne répond pas. Vérifiez que l'API et la base sont lancées
            (voir le README), puis réessayez.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            ← Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 text-slate-400">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Ouverture de la démo…
      </div>
    </div>
  );
}

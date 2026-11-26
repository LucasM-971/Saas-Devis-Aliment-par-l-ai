import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Wrench } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// Bouton de développement : connexion 1-clic sur le compte de démo seedé.
// Rendu uniquement en mode dev (import.meta.env.DEV) : en production, il
// offrirait à n'importe qui un accès direct au compte seedé depuis Login/Register.
export function DevBypassButton() {
  const { loginAsDev } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  if (!import.meta.env.DEV) return null;

  const enter = async () => {
    setLoading(true);
    setError(false);
    try {
      await loginAsDev();
      navigate('/app');
    } catch {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={enter}
        disabled={loading}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}
        Accès dev (compte de démo)
      </button>
      {error && (
        <p className="mt-2 text-center text-xs text-rose-600">
          API injoignable — démarre le backend et vérifie VITE_API_URL.
        </p>
      )}
    </>
  );
}

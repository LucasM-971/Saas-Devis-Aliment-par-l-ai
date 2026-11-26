import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

type State<T> = { data: T | null; loading: boolean; error: string | null; refetch: () => void };

// Récupère des données depuis l'API (chargement initial + refetch manuel).
export function useApi<T>(path: string): State<T> {
  const { activeCompanyId } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // activeCompanyId : recharge quand on change d'entreprise (en-tête X-Company-Id).
    void activeCompanyId;
  }, [path, activeCompanyId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

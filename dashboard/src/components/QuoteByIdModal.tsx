import { useEffect, useState } from 'react';
import { QuoteFormModal } from '@/components/QuoteFormModal';
import { api } from '@/lib/api';
import type { Quote } from '@/types';

// Ouvre la popup d'un devis à partir de son id, sur la page qui l'appelle.
export function QuoteByIdModal({
  quoteId,
  onClose,
  onSaved,
}: {
  quoteId: string | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    if (!quoteId) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    api
      .get<Quote[]>('/api/v1/quotes')
      .then((list) => {
        if (!cancelled) setQuote(list.find((q) => q.id === quoteId) ?? null);
      })
      .catch(() => {
        if (!cancelled) onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [quoteId, onClose]);

  return (
    <QuoteFormModal
      open={quoteId !== null && quote !== null}
      quote={quote}
      onClose={onClose}
      onSaved={() => onSaved?.()}
    />
  );
}

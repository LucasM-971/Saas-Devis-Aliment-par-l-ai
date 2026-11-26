import type { Quote, QuoteStatus } from '@/types';

export type QuoteFilter = QuoteStatus | 'tous';

// Filtre les devis par statut puis par recherche (référence ou nom du client).
export function filterQuotes(quotes: Quote[], filter: QuoteFilter, search: string): Quote[] {
  const needle = search.trim().toLowerCase();
  return quotes.filter((quote) => {
    if (filter !== 'tous' && quote.status !== filter) return false;
    if (!needle) return true;
    return (
      quote.reference.toLowerCase().includes(needle) ||
      quote.clientName.toLowerCase().includes(needle)
    );
  });
}

// Compte le nombre de devis par statut (alimente les compteurs de filtres).
export function countByStatus(quotes: Quote[]): Record<QuoteStatus, number> {
  const counts = {
    brouillon: 0,
    en_attente: 0,
    pret: 0,
    envoye: 0,
    accepte: 0,
    refuse: 0,
    expire: 0,
  } as Record<QuoteStatus, number>;
  for (const quote of quotes) counts[quote.status]++;
  return counts;
}

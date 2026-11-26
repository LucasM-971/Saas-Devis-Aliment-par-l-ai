import type { Quote } from '@/types';
import { computeQuoteTotals } from './quote-math';

export type DashboardStats = {
  demandesEnAttente: number;
  pretAValider: number;
  montantPotentiel: number; // TTC des devis en cours (non refusés/expirés)
  tauxCompletion: number; // accepté / (accepté + refusé), ratio 0..1
};

// Agrège les indicateurs de la page d'accueil à partir des devis.
export function computeDashboardStats(quotes: Quote[]): DashboardStats {
  let demandesEnAttente = 0;
  let pretAValider = 0;
  let montantPotentiel = 0;
  let accepted = 0;
  let refused = 0;

  for (const quote of quotes) {
    if (quote.status === 'en_attente') demandesEnAttente++;
    if (quote.status === 'pret') pretAValider++;
    if (quote.status === 'accepte') accepted++;
    if (quote.status === 'refuse') refused++;

    if (['en_attente', 'pret', 'envoye'].includes(quote.status)) {
      montantPotentiel += computeQuoteTotals(quote).total;
    }
  }

  const decided = accepted + refused;
  return {
    demandesEnAttente,
    pretAValider,
    montantPotentiel: Math.round(montantPotentiel),
    tauxCompletion: decided === 0 ? 0 : accepted / decided,
  };
}

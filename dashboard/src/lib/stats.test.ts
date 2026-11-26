import { describe, expect, it } from 'vitest';
import { computeDashboardStats } from './stats';
import type { Quote, QuoteStatus } from '@/types';

const quote = (status: QuoteStatus, unitPrice: number): Quote => ({
  id: status + unitPrice,
  reference: 'DEV-0001',
  clientName: 'Client',
  status,
  lines: [{ id: 'l', label: 'x', quantity: 1, unitPrice }],
  vatRate: 0.2,
  createdAt: '2026-01-01',
});

describe('computeDashboardStats', () => {
  const quotes: Quote[] = [
    quote('en_attente', 100), // TTC 120
    quote('en_attente', 100), // TTC 120
    quote('pret', 200), // TTC 240
    quote('envoye', 500), // TTC 600
    quote('accepte', 1000), // hors montant potentiel
    quote('refuse', 1000), // hors montant potentiel
  ];

  it('compte les demandes en attente et les devis prêts', () => {
    const stats = computeDashboardStats(quotes);
    expect(stats.demandesEnAttente).toBe(2);
    expect(stats.pretAValider).toBe(1);
  });

  it('somme le montant potentiel TTC des devis en cours', () => {
    expect(computeDashboardStats(quotes).montantPotentiel).toBe(120 + 120 + 240 + 600);
  });

  it('calcule le taux de complétion (accepté / décidé)', () => {
    expect(computeDashboardStats(quotes).tauxCompletion).toBe(0.5);
  });

  it('renvoie un taux de 0 sans devis décidé', () => {
    expect(computeDashboardStats([quote('en_attente', 100)]).tauxCompletion).toBe(0);
  });
});

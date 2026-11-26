import { describe, expect, it } from 'vitest';
import { computeLeadStats, filterLeads, isConverted } from './leads';
import type { Lead } from '@/types';

const lead = (id: string, name: string, email: string, quoteId?: string): Lead => ({
  id,
  name,
  email,
  source: 'Widget',
  createdAt: '2026-01-01',
  quoteId,
});

const leads: Lead[] = [
  lead('1', 'Marie Lefèvre', 'marie@email.fr', 'q1'),
  lead('2', 'Thomas Garnier', 'thomas@email.fr'),
  lead('3', 'SCI Bellevue', 'contact@bellevue.fr', 'q2'),
  lead('4', 'Julien Robert', 'julien@email.fr'),
];

describe('isConverted', () => {
  it('est vrai uniquement avec un devis rattaché', () => {
    expect(isConverted(leads[0])).toBe(true);
    expect(isConverted(leads[1])).toBe(false);
  });
});

describe('filterLeads', () => {
  it('filtre les prospects convertis', () => {
    expect(filterLeads(leads, 'convertis', '')).toHaveLength(2);
  });

  it('filtre les prospects à traiter', () => {
    expect(filterLeads(leads, 'a_traiter', '')).toHaveLength(2);
  });

  it('recherche par email', () => {
    expect(filterLeads(leads, 'tous', 'bellevue')).toHaveLength(1);
  });
});

describe('computeLeadStats', () => {
  it('compte total, convertis et à traiter', () => {
    const stats = computeLeadStats(leads);
    expect(stats.total).toBe(4);
    expect(stats.convertis).toBe(2);
    expect(stats.aTraiter).toBe(2);
  });

  it('calcule le taux de conversion', () => {
    expect(computeLeadStats(leads).tauxConversion).toBe(0.5);
  });

  it('renvoie un taux de 0 sans prospect', () => {
    expect(computeLeadStats([]).tauxConversion).toBe(0);
  });
});

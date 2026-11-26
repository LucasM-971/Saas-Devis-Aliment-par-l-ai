import { describe, expect, it } from 'vitest';
import { countByStatus, filterQuotes } from './quotes';
import type { Quote, QuoteStatus } from '@/types';

const quote = (id: string, reference: string, clientName: string, status: QuoteStatus): Quote => ({
  id,
  reference,
  clientName,
  status,
  lines: [{ id: 'l', label: 'x', quantity: 1, unitPrice: 100 }],
  vatRate: 0.2,
  createdAt: '2026-01-01',
});

const quotes: Quote[] = [
  quote('1', 'DEV-2026-0001', 'Marie Lefèvre', 'en_attente'),
  quote('2', 'DEV-2026-0002', 'SCI Bellevue', 'pret'),
  quote('3', 'DEV-2026-0003', 'Marie Dupont', 'pret'),
];

describe('filterQuotes', () => {
  it('renvoie tout sans filtre ni recherche', () => {
    expect(filterQuotes(quotes, 'tous', '')).toHaveLength(3);
  });

  it('filtre par statut', () => {
    expect(filterQuotes(quotes, 'pret', '')).toHaveLength(2);
  });

  it('recherche par nom de client, insensible à la casse', () => {
    expect(filterQuotes(quotes, 'tous', 'marie')).toHaveLength(2);
  });

  it('recherche par référence', () => {
    const found = filterQuotes(quotes, 'tous', '0002');
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('2');
  });

  it('combine filtre de statut et recherche', () => {
    expect(filterQuotes(quotes, 'pret', 'marie')).toHaveLength(1);
  });
});

describe('countByStatus', () => {
  it('compte les devis par statut', () => {
    const counts = countByStatus(quotes);
    expect(counts.pret).toBe(2);
    expect(counts.en_attente).toBe(1);
    expect(counts.refuse).toBe(0);
  });
});

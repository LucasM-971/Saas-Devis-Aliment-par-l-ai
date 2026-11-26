import { describe, expect, it } from 'vitest';
import { computeDiscount, computeQuoteTotals, lineTotal } from './quote-math';
import type { QuoteLine } from '@/types';

const line = (quantity: number, unitPrice: number): QuoteLine => ({
  id: 'l',
  label: 'x',
  quantity,
  unitPrice,
});

describe('lineTotal', () => {
  it('multiplie quantité par prix unitaire', () => {
    expect(lineTotal(line(3, 10))).toBe(30);
  });

  it('arrondit au centime', () => {
    expect(lineTotal(line(3, 0.1))).toBe(0.3); // évite 0.30000000000000004
  });
});

describe('computeQuoteTotals', () => {
  it('calcule HT, TVA et TTC', () => {
    const totals = computeQuoteTotals({
      lines: [line(2, 100), line(1, 50)],
      vatRate: 0.2,
    });
    expect(totals).toEqual({ subtotal: 250, discount: 0, netSubtotal: 250, vat: 50, total: 300 });
  });

  it('gère un devis vide', () => {
    expect(computeQuoteTotals({ lines: [], vatRate: 0.2 })).toEqual({
      subtotal: 0,
      discount: 0,
      netSubtotal: 0,
      vat: 0,
      total: 0,
    });
  });

  it('applique un taux de TVA réduit', () => {
    const totals = computeQuoteTotals({ lines: [line(1, 200)], vatRate: 0.1 });
    expect(totals.vat).toBe(20);
    expect(totals.total).toBe(220);
  });
});

describe('remises', () => {
  it('applique une remise en pourcentage (TVA sur le HT net)', () => {
    const totals = computeQuoteTotals({
      lines: [line(10, 100)],
      vatRate: 0.2,
      discountType: 'percent',
      discountValue: 10,
    });
    expect(totals.subtotal).toBe(1000);
    expect(totals.discount).toBe(100);
    expect(totals.netSubtotal).toBe(900);
    expect(totals.vat).toBe(180);
    expect(totals.total).toBe(1080);
  });

  it('applique une remise en euros', () => {
    const totals = computeQuoteTotals({
      lines: [line(10, 100)],
      vatRate: 0.2,
      discountType: 'amount',
      discountValue: 250,
    });
    expect(totals.discount).toBe(250);
    expect(totals.total).toBe(900);
  });

  it('borne la remise au sous-total (jamais de devis négatif)', () => {
    const totals = computeQuoteTotals({
      lines: [line(1, 100)],
      vatRate: 0.2,
      discountType: 'amount',
      discountValue: 500,
    });
    expect(totals.discount).toBe(100);
    expect(totals.netSubtotal).toBe(0);
    expect(totals.total).toBe(0);
  });

  it('arrondit la remise en pourcentage au centime', () => {
    expect(computeDiscount(99.99, 'percent', 33)).toBe(33);
  });

  it('ignore une remise nulle, négative ou sans type', () => {
    expect(computeDiscount(100, undefined, 10)).toBe(0);
    expect(computeDiscount(100, null, 10)).toBe(0);
    expect(computeDiscount(100, 'percent', 0)).toBe(0);
    expect(computeDiscount(100, 'amount', -5)).toBe(0);
  });
});

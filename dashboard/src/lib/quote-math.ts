import type { Quote, QuoteLine } from '@/types';

// Arrondi monétaire au centime (évite les erreurs de virgule flottante).
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineTotal(line: QuoteLine): number {
  return round2(line.quantity * line.unitPrice);
}

export type QuoteTotals = {
  subtotal: number; // HT brut (somme des lignes)
  discount: number; // remise en euros (0 si aucune)
  netSubtotal: number; // HT après remise (assiette de la TVA)
  vat: number;
  total: number;
};

// Remise en euros à partir du HT brut. Bornée à [0, subtotal] : une remise
// ne rend jamais un devis négatif. Miroir de backend/services/pricing_engine.
export function computeDiscount(
  subtotal: number,
  discountType: Quote['discountType'],
  discountValue: number,
): number {
  if (!discountType || discountValue <= 0) return 0;
  const amount =
    discountType === 'percent' ? round2((subtotal * discountValue) / 100) : round2(discountValue);
  return Math.min(amount, subtotal);
}

// Calcule HT, remise, TVA et TTC d'un devis à partir de ses lignes.
export function computeQuoteTotals(
  quote: Pick<Quote, 'lines' | 'vatRate' | 'discountType' | 'discountValue'>,
): QuoteTotals {
  const subtotal = round2(quote.lines.reduce((sum, line) => sum + lineTotal(line), 0));
  const discount = computeDiscount(subtotal, quote.discountType, quote.discountValue ?? 0);
  const netSubtotal = round2(subtotal - discount);
  const vat = round2(netSubtotal * quote.vatRate);
  return { subtotal, discount, netSubtotal, vat, total: round2(netSubtotal + vat) };
}

// Utilitaires du catalogue de prestations.

import { getTrade, type CatalogItem, type TradeId } from '@/lib/trades';

// Forme comparable d'un libellé (casse, accents et espaces ignorés).
export function normalizeLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

// Instancie le catalogue type d'un métier avec des ids stables.
export function presetCatalog(tradeId: TradeId): CatalogItem[] {
  const trade = getTrade(tradeId);
  if (!trade) return [];
  return trade.catalog.map((item, i) => ({ id: `${tradeId}-${i + 1}`, ...item }));
}

// Ajoute les prestations absentes sans écraser les existantes.
export function mergeCatalog(current: CatalogItem[], incoming: CatalogItem[]): CatalogItem[] {
  const seen = new Set(current.map((i) => normalizeLabel(i.label)));
  const additions = incoming.filter((i) => !seen.has(normalizeLabel(i.label)));
  return [...current, ...additions];
}

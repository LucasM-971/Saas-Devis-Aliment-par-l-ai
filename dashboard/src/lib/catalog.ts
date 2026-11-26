// Aides pures autour du catalogue de prestations d'une entreprise.
// La persistance (métier + grille tarifaire) passe par l'API :
// GET/PUT /api/v1/pricing/items et PATCH /api/v1/companies/current.

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

// Ajoute au catalogue courant les prestations absentes (comparaison par libellé
// normalisé) sans écraser les lignes déjà personnalisées.
export function mergeCatalog(current: CatalogItem[], incoming: CatalogItem[]): CatalogItem[] {
  const seen = new Set(current.map((i) => normalizeLabel(i.label)));
  const additions = incoming.filter((i) => !seen.has(normalizeLabel(i.label)));
  return [...current, ...additions];
}

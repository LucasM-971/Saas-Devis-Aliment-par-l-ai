import { describe, expect, it } from 'vitest';
import { mergeCatalog, normalizeLabel, presetCatalog } from './catalog';
import { TRADES, type CatalogItem } from './trades';

describe('normalizeLabel', () => {
  it('ignore casse, accents et espaces superflus', () => {
    expect(normalizeLabel('  Pose de  PARQUET ')).toBe('pose de parquet');
    expect(normalizeLabel('Débouchage')).toBe(normalizeLabel('debouchage'));
  });
});

describe('presetCatalog', () => {
  it('reprend toutes les prestations du métier avec des ids stables', () => {
    const reno = TRADES.find((t) => t.id === 'reno')!;
    const items = presetCatalog('reno');
    expect(items).toHaveLength(reno.catalog.length);
    expect(items[0].id).toBe('reno-1');
    expect(items.at(-1)!.id).toBe(`reno-${reno.catalog.length}`);
  });

  it("retourne des copies : muter le résultat n'altère pas TRADES", () => {
    const before = TRADES.find((t) => t.id === 'peinture')!.catalog[0].unitPrice;
    const items = presetCatalog('peinture');
    items[0].unitPrice = 999;
    expect(TRADES.find((t) => t.id === 'peinture')!.catalog[0].unitPrice).toBe(before);
  });

  it('renvoie un tableau vide pour un métier inconnu', () => {
    expect(presetCatalog('inconnu' as never)).toEqual([]);
  });
});

describe('mergeCatalog', () => {
  const item = (id: string, label: string): CatalogItem => ({ id, label, unit: 'unit', unitPrice: 10 });

  it('ajoute uniquement les prestations absentes (comparaison par libellé normalisé)', () => {
    const current = [item('a', 'Pose de parquet')];
    const incoming = [item('b', '  pose de PARQUET '), item('c', 'Ragréage de sol')];
    const merged = mergeCatalog(current, incoming);
    expect(merged.map((i) => i.label)).toEqual(['Pose de parquet', 'Ragréage de sol']);
  });

  it('préserve les lignes existantes et leurs prix personnalisés', () => {
    const preset = presetCatalog('peinture');
    const current = [{ ...item('a', preset[0].label), unitPrice: 40 }];
    const merged = mergeCatalog(current, preset);
    expect(merged[0].unitPrice).toBe(40); // ligne perso conservée
    expect(merged).toHaveLength(preset.length); // le doublon n'est pas ré-ajouté
  });

  it("ne modifie pas le tableau d'origine", () => {
    const current = [item('a', 'Diagnostic')];
    mergeCatalog(current, [item('b', 'Autre')]);
    expect(current).toHaveLength(1);
  });
});

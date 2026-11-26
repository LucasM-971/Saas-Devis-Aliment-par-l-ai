import { describe, expect, it } from 'vitest';
import { groupAuditByDay, relativeDayLabel } from './audit';
import type { AuditEntry } from '@/types';

const now = new Date('2026-06-29T12:00:00');

const entry = (id: string, createdAt: string): AuditEntry => ({
  id,
  type: 'quote',
  actor: 'Lucas',
  action: 'a validé le devis',
  target: 'DEV-0001',
  createdAt,
});

describe('relativeDayLabel', () => {
  it('renvoie « Aujourd\'hui » pour le jour courant', () => {
    expect(relativeDayLabel('2026-06-29', now)).toBe("Aujourd'hui");
  });

  it('renvoie « Hier » pour la veille', () => {
    expect(relativeDayLabel('2026-06-28', now)).toBe('Hier');
  });

  it('renvoie une date longue au-delà', () => {
    expect(relativeDayLabel('2026-06-25', now)).not.toMatch(/Aujourd|Hier/);
  });
});

describe('groupAuditByDay', () => {
  const entries = [
    entry('a', '2026-06-29'),
    entry('b', '2026-06-28'),
    entry('c', '2026-06-29'),
    entry('d', '2026-06-25'),
  ];

  it('regroupe les entrées par jour', () => {
    const groups = groupAuditByDay(entries, now);
    expect(groups).toHaveLength(3);
    expect(groups[0].entries).toHaveLength(2); // deux le 29
  });

  it('trie les groupes du plus récent au plus ancien', () => {
    const groups = groupAuditByDay(entries, now);
    expect(groups.map((g) => g.key)).toEqual(['2026-06-29', '2026-06-28', '2026-06-25']);
  });
});

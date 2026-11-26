// Unités BTP : valeur stockée → libellé affiché.
export const UNIT_LABELS: Record<string, string> = {
  m2: 'm²',
  ml: 'ml',
  m3: 'm³',
  unit: 'u',
  hour: 'h',
  flat: 'forfait',
  '-': '-',
};

export const UNIT_OPTIONS = ['m2', 'ml', 'm3', 'unit', 'hour', 'flat', '-'];

export function unitLabel(unit?: string): string {
  return unit ? (UNIT_LABELS[unit] ?? unit) : '';
}

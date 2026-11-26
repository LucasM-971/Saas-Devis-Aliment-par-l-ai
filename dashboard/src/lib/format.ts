// Helpers de formatage, locale FR.

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number): string {
  return eur.format(amount);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(iso));
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}

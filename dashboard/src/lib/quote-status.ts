import type { Tone } from '@/components/ui/Badge';
import type { QuoteStatus } from '@/types';

// Libellé FR + couleur associés à chaque statut de devis.
export const STATUS_META: Record<QuoteStatus, { label: string; tone: Tone }> = {
  brouillon: { label: 'Brouillon', tone: 'slate' },
  en_attente: { label: 'En attente', tone: 'amber' },
  pret: { label: 'Prêt à valider', tone: 'blue' },
  envoye: { label: 'Envoyé', tone: 'brand' },
  accepte: { label: 'Accepté', tone: 'green' },
  refuse: { label: 'Refusé', tone: 'rose' },
  expire: { label: 'Expiré', tone: 'slate' },
};

export const STATUS_ORDER: QuoteStatus[] = [
  'brouillon',
  'en_attente',
  'pret',
  'envoye',
  'accepte',
  'refuse',
  'expire',
];

export type QuoteAction = {
  to: QuoteStatus;
  label: string;
  variant: 'primary' | 'danger';
};

// Machine d'états front : transitions de statut proposées depuis chaque statut.
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteAction[]> = {
  brouillon: [{ to: 'pret', label: 'Marquer prêt', variant: 'primary' }],
  en_attente: [{ to: 'pret', label: 'Marquer prêt', variant: 'primary' }],
  pret: [{ to: 'envoye', label: 'Valider et envoyer', variant: 'primary' }],
  envoye: [
    { to: 'accepte', label: 'Marquer accepté', variant: 'primary' },
    { to: 'refuse', label: 'Marquer refusé', variant: 'danger' },
  ],
  accepte: [],
  refuse: [],
  expire: [],
};

export function nextActions(status: QuoteStatus): QuoteAction[] {
  return QUOTE_TRANSITIONS[status];
}

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].some((action) => action.to === to);
}

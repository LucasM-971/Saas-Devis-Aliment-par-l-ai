import { describe, expect, it } from 'vitest';
import { canTransition, nextActions } from './quote-status';

describe('nextActions', () => {
  it('propose de valider et envoyer un devis prêt', () => {
    const actions = nextActions('pret');
    expect(actions).toHaveLength(1);
    expect(actions[0].to).toBe('envoye');
  });

  it('propose accepté et refusé pour un devis envoyé', () => {
    expect(nextActions('envoye').map((a) => a.to)).toEqual(['accepte', 'refuse']);
  });

  it('ne propose aucune action sur un statut terminal', () => {
    expect(nextActions('accepte')).toHaveLength(0);
    expect(nextActions('refuse')).toHaveLength(0);
  });
});

describe('canTransition', () => {
  it('autorise les transitions définies', () => {
    expect(canTransition('pret', 'envoye')).toBe(true);
    expect(canTransition('envoye', 'accepte')).toBe(true);
  });

  it('refuse les transitions non définies', () => {
    expect(canTransition('brouillon', 'accepte')).toBe(false);
    expect(canTransition('accepte', 'envoye')).toBe(false);
  });
});

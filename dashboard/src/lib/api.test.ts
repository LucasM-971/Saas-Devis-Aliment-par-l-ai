import { describe, expect, it } from 'vitest';
import { extractDetail } from './api';

// Garde-fou anti-régression : le champ `detail` d'une erreur FastAPI doit
// toujours donner un message lisible (jamais « [object Object] »).
describe('extractDetail', () => {
  it('renvoie tel quel le detail chaîne (HTTPException)', () => {
    expect(extractDetail('Cette personne fait déjà partie de l’équipe')).toBe(
      'Cette personne fait déjà partie de l’équipe',
    );
  });

  it('assemble les messages d’un tableau de validation 422 (pydantic)', () => {
    const detail = [
      { type: 'value_error', loc: ['body', 'email'], msg: 'value is not a valid email address' },
    ];
    expect(extractDetail(detail)).toBe('value is not a valid email address');
  });

  it('joint plusieurs messages de validation', () => {
    const detail = [{ msg: 'champ A invalide' }, { msg: 'champ B invalide' }];
    expect(extractDetail(detail)).toBe('champ A invalide champ B invalide');
  });

  it('extrait le msg d’un objet d’erreur unique', () => {
    expect(extractDetail({ msg: 'erreur unique' })).toBe('erreur unique');
  });

  it('renvoie undefined pour une forme inconnue (repli sur « Erreur N »)', () => {
    expect(extractDetail(undefined)).toBeUndefined();
    expect(extractDetail({ code: 500 })).toBeUndefined();
    expect(extractDetail([])).toBeUndefined();
  });
});

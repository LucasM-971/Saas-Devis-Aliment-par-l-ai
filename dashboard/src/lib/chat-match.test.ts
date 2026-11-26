import { describe, expect, it } from 'vitest';
import { cosineSim, match, shorten, tokenize, type MessageBloc, type QA } from './chat-match';

const QAS: QA[] = [
  { id: 'q1', question: 'Comment obtenir un devis ?', answer: 'Remplissez notre formulaire en ligne.' },
  { id: 'q2', question: 'Le devis est-il gratuit ?', answer: "Oui, l'établissement du devis est gratuit." },
  { id: 'q3', question: 'Dans quel délai je reçois mon devis ?', answer: 'Sous 24 à 48 heures ouvrées.' },
];

const BLOCS: MessageBloc[] = [
  { id: 'b1', trigger: 'je veux un devis commencer démarrer projet', text: 'Quel type de projet ?', buttons: ['Neuf', 'Rénovation'] },
];

describe('tokenize', () => {
  it('retire accents, ponctuation et mots vides', () => {
    expect(tokenize('Comment ça marche, vraiment ?')).toEqual(['marche', 'vraiment']);
  });

  it('rapproche singulier et pluriel', () => {
    expect(tokenize('travaux')).toEqual(tokenize('travail'));
    expect(tokenize('devis gratuits')).toEqual(['devis', 'gratuit']);
  });

  it('ramène les synonymes à une forme canonique', () => {
    expect(tokenize('tarif')).toEqual(['prix']);
    expect(tokenize('combien ça coûte')).toContain('prix');
    expect(tokenize('estimation')).toEqual(['devis']);
  });
});

describe('cosineSim', () => {
  it('vaut 1 pour deux ensembles identiques', () => {
    expect(cosineSim(['a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('vaut 0 sans recouvrement ou ensemble vide', () => {
    expect(cosineSim(['a'], ['b'])).toBe(0);
    expect(cosineSim([], ['b'])).toBe(0);
  });

  it('ignore les répétitions (présence binaire)', () => {
    expect(cosineSim(['a', 'a', 'b'], ['a', 'b'])).toBe(1);
  });
});

describe('shorten', () => {
  it('tronque avec une ellipse au-delà de la limite', () => {
    expect(shorten('abcdef', 4)).toBe('abc…');
    expect(shorten('abc', 4)).toBe('abc');
  });
});

describe('match', () => {
  it('répond aux salutations sans dépendre de la base', () => {
    const r = match('Bonjour', [], []);
    expect(r.source).toBe('greeting');
    expect(r.score).toBe(1);
  });

  it('répond aux remerciements', () => {
    expect(match('merci beaucoup', QAS, BLOCS).source).toBe('thanks');
  });

  it('utilise le tarif au m² quand il est renseigné', () => {
    const r = match('quel est le prix au m² ?', QAS, BLOCS, '45');
    expect(r.source).toBe('price');
    expect(r.answer).toContain('45');
  });

  it("n'invoque pas la règle prix sans tarif configuré", () => {
    expect(match('quel est le prix ?', QAS, BLOCS).source).not.toBe('price');
  });

  it('priorise un bloc à boutons proche du trigger', () => {
    const r = match('je voudrais démarrer un projet', QAS, BLOCS);
    expect(r.source).toBe('bloc');
    expect(r.matchedId).toBe('b1');
    expect(r.buttons).toEqual(['Neuf', 'Rénovation']);
  });

  it('retrouve une Q&R par similarité, même mal formulée', () => {
    const r = match('cest gratuit le devis', QAS, BLOCS);
    expect(r.source).toBe('qa');
    expect(r.matchedId).toBe('q2');
    expect(r.score).toBeGreaterThan(0);
  });

  it('propose des questions de repli quand rien ne matche', () => {
    const r = match('xyz azerty qwerty', QAS, BLOCS);
    expect(r.source).toBe('fallback');
    expect(r.score).toBe(0);
    expect(r.buttons.length).toBeGreaterThan(0);
  });
});

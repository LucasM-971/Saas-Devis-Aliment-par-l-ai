import { describe, expect, it } from 'vitest';
import { companyIdentityLines, legalMentions } from './quote-pdf';

describe('companyIdentityLines', () => {
  it('n’affiche que les champs renseignés', () => {
    const lines = companyIdentityLines({
      name: 'Acme',
      siret: '12345678900010',
      apeCode: '4334Z',
      address: '1 rue des Artisans, Paris',
    });
    expect(lines).toEqual([
      '1 rue des Artisans, Paris',
      'SIRET 12345678900010 · APE 4334Z',
    ]);
  });

  it('assemble forme juridique et capital social', () => {
    const [statut] = companyIdentityLines({
      name: 'Acme',
      legalForm: 'SASU',
      shareCapital: '5 000 €',
    });
    expect(statut).toBe('SASU au capital de 5 000 €');
  });

  it('renvoie une liste vide sans aucune donnée légale', () => {
    expect(companyIdentityLines({ name: 'Acme' })).toEqual([]);
  });
});

describe('legalMentions', () => {
  it('inclut toujours l’engagement de signature avant travaux', () => {
    const mentions = legalMentions({ name: 'Acme' });
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toContain('Bon pour accord');
  });

  it('ajoute la franchise en base de TVA (art. 293 B)', () => {
    const mentions = legalMentions({ name: 'Acme', vatExempt: true });
    expect(mentions[0]).toBe('TVA non applicable, art. 293 B du CGI.');
  });

  it('formate l’assurance décennale avec contrat et couverture', () => {
    const mentions = legalMentions({
      name: 'Acme',
      insuranceName: 'AXA France',
      insuranceContract: '123456789',
      insuranceCoverage: 'France métropolitaine',
    });
    expect(mentions).toContain(
      'Assurance décennale : AXA France (contrat 123456789 · France métropolitaine).',
    );
  });

  it('ajoute la médiation avec le site quand il est fourni', () => {
    const mentions = legalMentions({
      name: 'Acme',
      mediatorName: 'CM2C',
      mediatorUrl: 'https://cm2c.net',
    });
    expect(mentions.some((m) => m.includes('CM2C') && m.includes('https://cm2c.net'))).toBe(true);
  });
});

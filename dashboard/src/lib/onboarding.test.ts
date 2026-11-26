import { describe, expect, it } from 'vitest';
import { needsOnboarding } from './onboarding';
import type { Membership, Role } from '@/types';

function membership(role: Role, metier?: Membership['company']['metier']): Membership {
  return { role, company: { id: '1', name: 'Test', metier } };
}

describe('needsOnboarding', () => {
  it('renvoie false sans membership', () => {
    expect(needsOnboarding(null)).toBe(false);
    expect(needsOnboarding(undefined)).toBe(false);
  });

  it('redirige un owner sans métier', () => {
    expect(needsOnboarding(membership('owner'))).toBe(true);
  });

  it('redirige un admin sans métier', () => {
    expect(needsOnboarding(membership('admin'))).toBe(true);
  });

  it('ne redirige pas quand le métier est déjà renseigné', () => {
    expect(needsOnboarding(membership('owner', 'plomberie'))).toBe(false);
  });

  it('ne redirige pas un membre simple, même sans métier', () => {
    expect(needsOnboarding(membership('member'))).toBe(false);
    expect(needsOnboarding(membership('viewer'))).toBe(false);
  });
});

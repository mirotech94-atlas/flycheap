import { describe, it, expect } from 'vitest';
import { conciergeScope } from '@/lib/conciergeToolset';

/**
 * The web concierge used to answer anyone with the owner's global toolset.
 * The rule: anonymous → nothing; the owner → the global tools; any other
 * signed-in user → FarePilot, scoped to their own user_id.
 */
describe('concierge scope', () => {
  const ownerIs = (id: number) => (u: { id: number }) => u.id === id;
  it('refuses anonymous callers', () => {
    expect(conciergeScope(null, ownerIs(1))).toBe('anonymous');
    expect(conciergeScope(undefined, ownerIs(1))).toBe('anonymous');
  });
  it('keeps the global tools for the owner only', () => {
    expect(conciergeScope({ id: 1 }, ownerIs(1))).toBe('owner');
  });
  it('gives every other user the scoped toolset', () => {
    expect(conciergeScope({ id: 3 }, ownerIs(1))).toBe('user');
  });
});

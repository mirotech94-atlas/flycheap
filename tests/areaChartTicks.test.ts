// tests/areaChartTicks.test.ts
import { describe, it, expect } from 'vitest';
import { selectTicks } from '@/app/admin/_components/AreaChart';

/**
 * Fix round 1, D2: `AreaChart`'s axis-label thinning must never exceed the
 * README's ≤12-tick cap. Striding by `Math.ceil(n / 12)` while also forcing
 * the first and last index on (the pre-fix approach) overshoots to 13 ticks
 * at n = 90 whenever the forced last index isn't already on the stride —
 * this locks the fixed, evenly-sampled `selectTicks` helper to the cap
 * across the sizes the review named plus a couple of extra edges.
 */
describe('AreaChart selectTicks', () => {
  it('never returns more than 12 ticks for any of the reviewed sizes', () => {
    for (const n of [1, 2, 12, 13, 24, 60, 90, 91, 120, 200]) {
      const ticks = selectTicks(n, 12);
      expect(ticks.length, `n=${n}`).toBeLessThanOrEqual(12);
    }
  });

  it('always includes the first and last index when n > 0', () => {
    for (const n of [1, 2, 12, 13, 24, 60, 90, 91, 120, 200]) {
      const ticks = selectTicks(n, 12);
      expect(ticks[0], `n=${n} first`).toBe(0);
      expect(ticks[ticks.length - 1], `n=${n} last`).toBe(n - 1);
    }
  });

  it('returns every index when n is at or below the cap', () => {
    expect(selectTicks(1, 12)).toEqual([0]);
    expect(selectTicks(2, 12)).toEqual([0, 1]);
    expect(selectTicks(12, 12)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it('returns indices in strictly ascending order with no duplicates', () => {
    for (const n of [13, 24, 60, 90, 91, 120, 200]) {
      const ticks = selectTicks(n, 12);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
      }
    }
  });

  it('handles n = 0', () => {
    expect(selectTicks(0, 12)).toEqual([]);
  });
});

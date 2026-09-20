import { describe, it, expect } from 'vitest';
import {
  priorityScore, qualifyingBand, applyPromotion, demote,
  BAND_CADENCE_MIN, BAND_ORDER, DEFAULT_WEIGHTS, PROMOTION_MOVE_PCT,
  type RouteSignals,
} from '@/lib/pollBudget';

const base: RouteSignals = {
  searchId: 1, routeKey: 'JFK-CAI-2026-W28-2a0i', userId: 1,
  watcherCount: 1, volatility30d: 0.1, proximityToThreshold: 0.6,
  daysToDeparture: 90, departureUrgency: 0.2, historicalConversion: 0,
  pollCostPerCall: 0.015, lastPrice: 800, lastMovePct: null,
};

describe('priority score', () => {
  it('ranks a route with more watchers above an otherwise identical one', () => {
    const one = priorityScore({ ...base, watcherCount: 1 });
    const many = priorityScore({ ...base, watcherCount: 20 });
    expect(many).toBeGreaterThan(one);
  });

  it('ranks a route near someone’s target above one far from it', () => {
    expect(priorityScore({ ...base, proximityToThreshold: 0.95 }))
      .toBeGreaterThan(priorityScore({ ...base, proximityToThreshold: 0.1 }));
  });

  it('penalises expensive providers, so cost actually enters the decision', () => {
    // The minus sign on pollCostPerCall is the whole reason the allocator can
    // economise rather than just reprioritise.
    expect(priorityScore({ ...base, pollCostPerCall: 0 }))
      .toBeGreaterThan(priorityScore({ ...base, pollCostPerCall: 1 }));
  });

  it('rewards a route that has actually produced a click-out', () => {
    expect(priorityScore({ ...base, historicalConversion: 1 }))
      .toBeGreaterThan(priorityScore({ ...base, historicalConversion: 0 }));
  });

  it('grows sub-linearly in watchers, so one popular route cannot dominate', () => {
    const w = DEFAULT_WEIGHTS;
    const at10 = priorityScore({ ...base, watcherCount: 10 }, w);
    const at100 = priorityScore({ ...base, watcherCount: 100 }, w);
    const at1 = priorityScore({ ...base, watcherCount: 1 }, w);
    expect(at100 - at10).toBeLessThan(at10 - at1 + (at10 - at1)); // diminishing returns
  });
});

describe('qualifying band', () => {
  it('puts an unwatched route in cold — history maintenance only', () => {
    expect(qualifyingBand({ ...base, watcherCount: 0 }).band).toBe('cold');
  });

  it('puts a route near a target in hot', () => {
    expect(qualifyingBand({ ...base, proximityToThreshold: 0.95 }).band).toBe('hot');
  });

  it('puts an imminent departure in hot regardless of price distance', () => {
    expect(qualifyingBand({ ...base, proximityToThreshold: 0.2, daysToDeparture: 14 }).band).toBe('hot');
  });

  it('puts a far-from-target, far-out route in cool', () => {
    expect(qualifyingBand({ ...base, proximityToThreshold: 0.2, daysToDeparture: 200 }).band).toBe('cool');
  });

  it('puts an ordinary watched route in warm', () => {
    expect(qualifyingBand({ ...base, proximityToThreshold: 0.6, daysToDeparture: 90 }).band).toBe('warm');
  });

  it('explains itself — every band decision carries a readable reason', () => {
    // "Why is this route polled every four hours" must have an answer you can
    // read off a page, which is the entire argument for bands over a curve.
    for (const s of [
      { ...base, watcherCount: 0 },
      { ...base, proximityToThreshold: 0.95 },
      { ...base, daysToDeparture: 5 },
      { ...base, proximityToThreshold: 0.2, daysToDeparture: 200 },
      base,
    ]) {
      expect(qualifyingBand(s).reason.length).toBeGreaterThan(10);
    }
  });
});

describe('promotion', () => {
  it('promotes a cool route that just dropped sharply', () => {
    // A fare rarely goes from normal to 3σ without a visible move first. This
    // rule is what preserves the mistake-fare catch rate while cutting spend.
    const r = applyPromotion('cool', -(PROMOTION_MOVE_PCT + 1));
    expect(r.band).toBe('hot');
    expect(r.promoted).toBe(true);
  });

  it('does not promote on a small move', () => {
    expect(applyPromotion('cool', -2).band).toBe('cool');
  });

  it('does not promote on a price RISE of the same size', () => {
    expect(applyPromotion('cool', PROMOTION_MOVE_PCT + 5).band).toBe('cool');
  });

  it('does nothing without history', () => {
    expect(applyPromotion('cool', null).band).toBe('cool');
  });
});

describe('bands', () => {
  it('demotes one step, and cold has nowhere to fall', () => {
    expect(demote('hot')).toBe('warm');
    expect(demote('warm')).toBe('cool');
    expect(demote('cool')).toBe('cold');
    expect(demote('cold')).toBe('cold');
  });

  it('gets strictly slower as it gets colder', () => {
    for (let i = 1; i < BAND_ORDER.length; i++) {
      expect(BAND_CADENCE_MIN[BAND_ORDER[i]])
        .toBeGreaterThan(BAND_CADENCE_MIN[BAND_ORDER[i - 1]]);
    }
  });
});

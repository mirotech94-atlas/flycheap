import { describe, it, expect } from 'vitest';
import {
  buildWorkQueue, buildSavingsReport, renewalSummary,
  DEPARTING_SOON_DAYS, UNREACHABLE_MARGIN_PCT,
  type WatchInput,
} from '@/lib/workQueue';

/**
 * "An agent should be able to work top-down and stop when the queue is empty.
 *  That is the difference between a tool that gets opened daily and one that
 *  gets opened when someone remembers."
 *
 * So the tests are about ORDER and about what the queue refuses to hide.
 */

const NOW = Date.parse('2026-09-20T12:00:00Z');
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString().slice(0, 10);

const watch = (over: Partial<WatchInput> = {}): WatchInput => ({
  id: 1, groupId: 10, groupName: 'Client A',
  origin: 'JFK', destination: 'CAI',
  departDate: inDays(90), status: 'active',
  ...over,
});

const build = (watches: WatchInput[], inactiveGroups: Array<{ id: number; name: string }> = []) =>
  buildWorkQueue({ watches, inactiveGroups, nowMs: NOW });

describe('what lands in the queue', () => {
  it('is empty when nothing needs a human', () => {
    // The queue has to be able to reach zero, or "work until it is empty" is
    // not an instruction anyone can follow.
    expect(build([watch()])).toEqual([]);
  });

  it('flags a verdict that flipped to buy', () => {
    const q = build([watch({ previousVerdict: 'wait', verdict: 'buy', currentAmount: 812 })]);
    expect(q).toHaveLength(1);
    expect(q[0].reason).toBe('verdict-flipped-to-buy');
    expect(q[0].detail).toContain('$812');
  });

  it('does not flag a verdict that did not flip', () => {
    expect(build([watch({ previousVerdict: 'buy', verdict: 'buy' })])).toEqual([]);
    expect(build([watch({ previousVerdict: 'hold', verdict: 'wait' })])).toEqual([]);
  });

  it('flags a departure inside the window with nothing booked', () => {
    const q = build([watch({ departDate: inDays(3) })]);
    expect(q[0].reason).toBe('departing-unbooked');
    expect(q[0].detail).toContain('3 days');
  });

  it('chases a departure that passed with nothing recorded', () => {
    // Without mark-booked the savings report has no numerator, so the queue
    // goes after it rather than waiting to be noticed.
    const q = build([watch({ departDate: inDays(-2) })]);
    expect(q[0].reason).toBe('booking-unrecorded');
    expect(q[0].detail).toMatch(/savings report cannot count/i);
  });

  it('flags a target the route has never come close to', () => {
    const q = build([watch({ targetAmount: 500, low30d: 900 })]);
    expect(q[0].reason).toBe('target-unreachable');
    expect(q[0].detail).toMatch(/resetting expectations/i);
  });

  it('leaves an ambitious but plausible target alone', () => {
    const justInside = 900 * (1 - (UNREACHABLE_MARGIN_PCT - 1) / 100);
    expect(build([watch({ targetAmount: justInside, low30d: 900 })])).toEqual([]);
  });

  it('says nothing about a booked watch', () => {
    // Booked trips are monitored for a rebooking drop, not chased in the queue.
    const q = build([watch({
      status: 'booked', departDate: inDays(3),
      previousVerdict: 'wait', verdict: 'buy', targetAmount: 500, low30d: 900,
    })]);
    expect(q).toEqual([]);
  });

  it('surfaces a silent group', () => {
    const q = build([], [{ id: 77, name: 'Dormant Client' }]);
    expect(q[0].reason).toBe('group-inactive');
    expect(q[0].watchId).toBeNull();
  });
});

describe('the order an agent works in', () => {
  it('puts act-now first and housekeeping last', () => {
    // A queue that opens with "this group has been quiet" above "this fare is
    // buyable today" trains people to skim it.
    const q = build([
      watch({ id: 1, targetAmount: 500, low30d: 900 }),
      watch({ id: 2, departDate: inDays(2) }),
      watch({ id: 3, previousVerdict: 'wait', verdict: 'buy' }),
      watch({ id: 4, departDate: inDays(-5) }),
    ], [{ id: 9, name: 'Quiet Co' }]);

    expect(q.map(i => i.reason)).toEqual([
      'verdict-flipped-to-buy',
      'departing-unbooked',
      'booking-unrecorded',
      'target-unreachable',
      'group-inactive',
    ]);
  });

  it('orders the departing band soonest-first', () => {
    const q = build([
      watch({ id: 1, departDate: inDays(10) }),
      watch({ id: 2, departDate: inDays(1) }),
      watch({ id: 3, departDate: inDays(5) }),
    ]);
    expect(q.map(i => i.daysToDeparture)).toEqual([1, 5, 10]);
  });

  it('lists a watch twice when two separate things are true about it', () => {
    // A trip departing in three days whose verdict just flipped to buy is two
    // things an agent needs to know. Collapsing them hides one.
    const q = build([watch({ departDate: inDays(3), previousVerdict: 'wait', verdict: 'buy' })]);
    expect(q.map(i => i.reason)).toEqual(['verdict-flipped-to-buy', 'departing-unbooked']);
  });

  it('respects the departing window boundary', () => {
    expect(build([watch({ departDate: inDays(DEPARTING_SOON_DAYS) })])).toHaveLength(1);
    expect(build([watch({ departDate: inDays(DEPARTING_SOON_DAYS + 1) })])).toHaveLength(0);
  });
});

describe('the savings report', () => {
  const trips = [
    { watchId: 1, route: 'JFK → CAI', baselineUsd: 1000, bookedUsd: 820 },
    { watchId: 2, route: 'JFK → LOS', baselineUsd: 1400, bookedUsd: 1500 },  // went UP
    { watchId: 3, route: 'JFK → BCN', baselineUsd: null, bookedUsd: 600 },
    { watchId: 4, route: 'JFK → LHR', baselineUsd: 800, bookedUsd: null },
  ];
  const report = () => buildSavingsReport({
    groupId: 1, groupName: 'Client A',
    periodStart: '2026-08-01', periodEnd: '2026-08-31', trips,
  });

  it('scores what it can and says what it could not', () => {
    const r = report();
    expect(r.lines.map(l => l.watchId)).toEqual([1, 2]);
    expect(r.unscored).toEqual([
      { watchId: 3, route: 'JFK → BCN', reason: 'no baseline captured' },
      { watchId: 4, route: 'JFK → LHR', reason: 'not marked booked' },
    ]);
  });

  it('includes a trip that cost MORE than its baseline', () => {
    // Hiding the losses is the same dishonesty as hiding the unscored. The
    // first time a client notices, the whole document stops being believed.
    const r = report();
    expect(r.totalSavedUsd).toBe(180 - 100);
    expect(r.lines.find(l => l.watchId === 2)!.savedUsd).toBe(-100);
  });

  it('never silently drops a trip', () => {
    const r = report();
    expect(r.lines.length + r.unscored.length).toBe(trips.length);
  });
});

describe('the renewal number', () => {
  it('produces the one figure a dean can be shown', () => {
    const s = renewalSummary({
      totalSavedUsd: 12000, subscriptionCostUsd: 2400, tripsScored: 40, tripsUnscored: 10,
    });
    expect(s.netUsd).toBe(9600);
    expect(s.multiple).toBe(5);
    expect(s.coveragePct).toBe(80);
  });

  it('states coverage, because a multiple on a fifth of the trips is a different claim', () => {
    const thin = renewalSummary({
      totalSavedUsd: 12000, subscriptionCostUsd: 1000, tripsScored: 10, tripsUnscored: 40,
    });
    expect(thin.multiple).toBe(12);
    expect(thin.coveragePct).toBe(20);
  });

  it('returns null rather than dividing by zero', () => {
    const s = renewalSummary({
      totalSavedUsd: 500, subscriptionCostUsd: 0, tripsScored: 0, tripsUnscored: 0,
    });
    expect(s.multiple).toBeNull();
    expect(s.coveragePct).toBeNull();
  });

  it('reports a loss as a loss', () => {
    const s = renewalSummary({
      totalSavedUsd: 300, subscriptionCostUsd: 2400, tripsScored: 5, tripsUnscored: 0,
    });
    expect(s.netUsd).toBe(-2100);
  });
});

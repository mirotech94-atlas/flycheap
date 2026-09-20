import { describe, it, expect } from 'vitest';
import { computeVerdict, type Verdict } from '@/lib/verdict';
import {
  explainVerdict, whatWouldChangeIt, buildTrackRecord, routeFamily,
  MIN_TRACK_RECORD,
} from '@/lib/verdictAnatomy';

/**
 * "A verdict is a claim about the future and the user knows it. The presentation
 *  has to make the claim falsifiable, or it reads as marketing."
 *
 * These tests exist to stop the two ways that promise gets broken: publishing a
 * confidence number that is not a percentage OF anything, and omitting the
 * fourth part.
 */

const history = (prices: number[]) =>
  prices.map((p, i) => ({
    polled_at: new Date(Date.UTC(2026, 7, i + 1)).toISOString(),
    price_per_adult_usd: p,
  }));

const verdictFor = (prices: number[], current: number, target = 900): Verdict =>
  computeVerdict(history(prices), current, target)!;

describe('the fourth part is always there', () => {
  it('names a concrete number or trend for every call', () => {
    // "It depends" is not an answer. The point is to show the model has a
    // shape, which means naming what would move it.
    const cases: Verdict[] = [
      verdictFor([900, 880, 860, 840, 820, 800], 800),   // falling
      verdictFor([600, 650, 700, 750, 800, 850], 620),   // rising, low in range
      verdictFor([700, 705, 698, 702, 699, 701], 700),   // flat
      verdictFor([500, 900, 600, 850, 700, 750], 1400),  // far above target
    ];
    for (const v of cases) {
      const text = whatWouldChangeIt(v);
      expect(text.length).toBeGreaterThan(30);
      // Either a dollar figure or an explicit statement about the trend.
      expect(/\$\d|trend/i.test(text)).toBe(true);
      expect(text).not.toMatch(/it depends/i);
    }
  });

  it('is carried through explainVerdict', () => {
    const a = explainVerdict(verdictFor([900, 880, 860, 840, 820, 800], 800));
    expect(a.whatWouldChangeIt).toBeTruthy();
    expect(a.call).toBeTruthy();
    expect(a.position.low).toBeLessThanOrEqual(a.position.high);
  });
});

describe('confidence is a percentage OF something', () => {
  const v = verdictFor([900, 880, 860, 840, 820, 800], 800);

  it('says plainly when the number is a model score, not a hit rate', () => {
    // A bare "72% confident" is not a real statement, so when we have not
    // measured the route the basis sentence must say so.
    const a = explainVerdict(v, null);
    expect(a.confidenceIsMeasured).toBe(false);
    expect(a.confidenceBasis).toMatch(/model score/i);
    expect(a.confidenceBasis).toMatch(/not a measured hit rate/i);
  });

  it('uses the measured hit rate once the route has enough scored calls', () => {
    const track = buildTrackRecord({
      routeFamily: routeFamily('JFK', 'CAI'),
      scored: 50, correct: 36, horizonDays: 14,
    });
    const a = explainVerdict(v, track);
    expect(a.confidenceIsMeasured).toBe(true);
    expect(a.confidencePct).toBe(72);
    // The sentence the spec asks for, in full.
    expect(a.confidenceBasis).toContain('72%');
    expect(a.confidenceBasis).toContain('JFK → CAI');
    expect(a.confidenceBasis).toContain('14 days');
    expect(a.confidenceBasis).toContain('36 of 50');
  });

  it('refuses to state a hit rate from too few calls', () => {
    // Two lucky calls is not a track record, and publishing it as one destroys
    // the exact thing the honesty surface exists to build.
    const thin = buildTrackRecord({
      routeFamily: routeFamily('JFK', 'CAI'),
      scored: 2, correct: 2, horizonDays: 14,
    });
    expect(thin.accuracyPct).toBeNull();
    const a = explainVerdict(v, thin);
    expect(a.confidenceIsMeasured).toBe(false);
    expect(a.confidenceBasis).toMatch(/model score/i);
  });

  it('publishes an unflattering number just as readily as a good one', () => {
    // "It will sometimes be unflattering. Publish it anyway — a measured 68% is
    // more persuasive than an unmeasured 95%."
    const poor = buildTrackRecord({
      routeFamily: routeFamily('EWR', 'DXB'),
      scored: 40, correct: 14, horizonDays: 14,
    });
    const a = explainVerdict(v, poor);
    expect(a.confidenceIsMeasured).toBe(true);
    expect(a.confidencePct).toBe(35);
    expect(a.confidenceBasis).toContain('14 of 40');
  });

  it('applies the minimum sample at exactly the boundary', () => {
    const at = buildTrackRecord({
      routeFamily: 'X → Y', scored: MIN_TRACK_RECORD, correct: 10, horizonDays: 7,
    });
    expect(at.accuracyPct).toBe(50);
    const below = buildTrackRecord({
      routeFamily: 'X → Y', scored: MIN_TRACK_RECORD - 1, correct: 10, horizonDays: 7,
    });
    expect(below.accuracyPct).toBeNull();
  });
});

describe('the wording matches the call', () => {
  it('phrases a buy as "did not go lower"', () => {
    const buy = verdictFor([900, 880, 860, 840, 820, 800], 800);
    const track = buildTrackRecord({ routeFamily: 'JFK → CAI', scored: 50, correct: 36, horizonDays: 14 });
    if (buy.verdict === 'buy') {
      expect(explainVerdict(buy, track).confidenceBasis).toMatch(/did not go lower/i);
    }
  });

  it('phrases a wait as "waiting paid off"', () => {
    const wait = verdictFor([500, 900, 600, 850, 700, 750], 1400);
    const track = buildTrackRecord({ routeFamily: 'JFK → CAI', scored: 50, correct: 36, horizonDays: 14 });
    if (wait.verdict === 'wait') {
      expect(explainVerdict(wait, track).confidenceBasis).toMatch(/waiting/i);
    }
  });
});

describe('route family', () => {
  it('normalises to a stable, readable key', () => {
    expect(routeFamily('jfk', 'cai')).toBe('JFK → CAI');
  });
});

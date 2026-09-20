import { describe, it, expect } from 'vitest';
import {
  composeCard, sortBoard, boardSummary, positionPct, distanceToTargetPct,
  targetPerAdultEquivalent,
  type BoardCardInput,
} from '@/lib/boardCard';
import type { WatchRow } from '@/lib/watch';
import { MIN_VERDICT_SAMPLES } from '@/lib/verdict';

/**
 * The card exists to answer one question: should I book yet?
 *
 * So the tests are about the two ways a card can lie — quoting a number in one
 * unit next to a target in another, and filling the "should I book" slot when
 * we have no basis for an answer.
 */

const NOW = Date.parse('2026-09-20T12:00:00Z');

const row = (over: Partial<WatchRow> = {}): WatchRow => ({
  id: 1,
  origin: 'JFK',
  destination: 'CAI',
  depart_date: '2026-12-01',
  return_date: '2026-12-15',
  adults: 1,
  infants: 0,
  active: 1,
  ...over,
});

/** n days of flat-ish history, per adult, oldest first. */
const history = (n: number, price = 900) =>
  Array.from({ length: n }, (_, i) => ({
    polled_at: new Date(NOW - (n - i) * 86_400_000).toISOString().slice(0, 10),
    price_per_adult_usd: price,
  }));

/** A history that actually moves, so min !== max and a verdict can be non-buy. */
const varied = (n: number, low = 800, high = 1200) =>
  Array.from({ length: n }, (_, i) => ({
    polled_at: new Date(NOW - (n - i) * 86_400_000).toISOString().slice(0, 10),
    price_per_adult_usd: i % 2 === 0 ? low : high,
  }));

const card = (over: Partial<BoardCardInput> = {}) => composeCard({
  row: row(),
  fare: { perAdultUsd: 900 },
  history: history(10),
  thresholdPerAdult: 900,
  nowMs: NOW,
  ...over,
});

describe('the headline is on the watch’s own basis', () => {
  it('quotes the party total for a family, not the adult fare', () => {
    // A family of four has never been interested in the adult fare.
    const c = card({
      row: row({ adults: 2, children: 2, target_amount: 3000, target_basis: 'party_total' }),
      fare: { perAdultUsd: 900 },
    });
    expect(c.price.amountUsd).toBe(3600);
    expect(c.price.basisLabel).toBe('for the party');
    // ...and the per-adult figure is still there, separately, for the analysis.
    expect(c.perAdultUsd).toBe(900);
  });

  it('keeps the 30-day range in per-adult dollars, separate from the headline', () => {
    // The range comes from price history, which is per adult. If the card drew
    // it against a party-total headline the marker would sit off the end of the
    // bar on every family watch.
    const c = card({
      row: row({ adults: 4, target_amount: 4000, target_basis: 'party_total' }),
      fare: { perAdultUsd: 900 },
      history: history(10, 900),
    });
    expect(c.price.amountUsd).toBe(3600);
    expect(c.range30!.current).toBe(900);
  });

  it('says when a party total was derived rather than quoted', () => {
    const derived = card({ row: row({ adults: 2, target_basis: 'party_total', target_amount: 2000 }) });
    expect(derived.price.quoted).toBe(false);

    const quoted = card({
      row: row({ adults: 2, target_basis: 'party_total', target_amount: 2000 }),
      fare: { perAdultUsd: 900, partyTotalUsd: 1750 },
    });
    expect(quoted.price.quoted).toBe(true);
    expect(quoted.price.amountUsd).toBe(1750);
  });
});

describe('under-target is never guessed', () => {
  it('compares target and price on the SAME basis', () => {
    // $3,600 for the party against a $4,000 party target is under. The per-adult
    // figure ($900) is irrelevant to that answer and must not leak into it.
    const c = card({
      row: row({ adults: 4, target_amount: 4000, target_basis: 'party_total' }),
      fare: { perAdultUsd: 900 },
    });
    expect(c.underTarget).toBe(true);
    expect(c.note).toContain('Under your target of $4,000');
  });

  it('is null — not false — when there is no target', () => {
    const c = card({ row: row({ target_amount: null, target_per_adult_usd: null }) });
    expect(c.underTarget).toBeNull();
  });

  it('is null when a trip target has no hotel figure to complete it', () => {
    // Hotel pricing is still blocked upstream. A flight total wearing a trip
    // total's name is the exact number a customer would hold us to.
    const c = card({
      row: row({ target_amount: 2500, target_basis: 'trip_total', include_hotel: 1, hotel_nights: 7 }),
      fare: { perAdultUsd: 900 },
    });
    expect(c.underTarget).toBeNull();
    expect(c.price.incomplete).toBe(true);
    expect(c.note).toMatch(/cannot price the accommodation/i);
  });

  it('does not let an incomplete trip total wear a trip total’s label', () => {
    // The explanatory note underneath does not undo a wrong label ON the
    // number. "$3,036 for the trip" is the figure a customer would hold us to.
    const c = card({
      row: row({ target_amount: 2500, target_basis: 'trip_total', include_hotel: 1, hotel_nights: 7 }),
      fare: { perAdultUsd: 900 },
    });
    expect(c.price.basisLabel).toBe('flights only');
  });

  it('states the gap when it is over', () => {
    const c = card({ row: row({ target_per_adult_usd: 700 }), fare: { perAdultUsd: 900 } });
    expect(c.underTarget).toBe(false);
    expect(c.note).toContain('$200 above your target of $700');
  });

  it('says BOTH things when a buy is still above the target', () => {
    // "BUY NOW" over "$208 above your target" reads as a contradiction unless
    // the card says why: cheap for this route, dearer than they wanted.
    const c = card({
      row: row({ target_per_adult_usd: 700 }), fare: { perAdultUsd: 850 },
      history: varied(14, 800, 1200), thresholdPerAdult: 700,
    });
    expect(c.state).toBe('buy');
    expect(c.note).toContain('Still $150 above your target of $700');
    expect(c.note.length).toBeGreaterThan('Still $150 above your target of $700 per adult.'.length);
  });
});

describe('one primary action per card', () => {
  it('offers Book only when the call is buy', () => {
    const buy = card({ fare: { perAdultUsd: 500 }, history: history(14, 900), thresholdPerAdult: 900 });
    expect(buy.state).toBe('buy');
    expect(buy.primary).toEqual({ kind: 'book', label: 'Book this fare' });
  });

  it('offers Why? when there is a call and it is not buy', () => {
    const wait = card({ fare: { perAdultUsd: 1400 }, history: history(14, 900), thresholdPerAdult: 700 });
    expect(wait.state).toBe('decide');
    expect(wait.primary.kind).toBe('why');
  });

  it('does NOT offer Why? when there is nothing to explain', () => {
    // Below MIN_VERDICT_SAMPLES there is no verdict, so a Why? link would open
    // a page with an empty anatomy on it.
    const thin = card({ history: history(MIN_VERDICT_SAMPLES - 1) });
    expect(thin.verdict).toBeNull();
    expect(thin.anatomy).toBeNull();
    expect(thin.state).toBe('gathering');
    expect(thin.primary.kind).toBe('detail');
    expect(thin.note).toMatch(/not\s+enough to tell you whether that is cheap/i);
  });

  it('never offers Book on a fare that failed verification', () => {
    // Booking a dead fare sends someone to a partner page quoting something
    // else, which is the single fastest way to lose them.
    const c = card({
      fare: { perAdultUsd: 500 }, history: history(14, 900), verifyOutcome: 'dead',
    });
    expect(c.state).toBe('stale');
    expect(c.primary.kind).not.toBe('book');
    expect(c.verifiedLabel).toBeNull();
  });

  it('has an action for a watch with no fare at all', () => {
    const c = card({ fare: null, history: [] });
    expect(c.state).toBe('no-fare');
    expect(c.price.amountUsd).toBeNull();
    expect(c.primary.label).toBeTruthy();
  });
});

describe('confidence when nothing has been scored yet', () => {
  it('still renders a basis sentence rather than an empty chip', () => {
    // Production has no route at MIN_TRACK_RECORD, so this is the ONLY branch
    // that exists today. It must read as a sentence, not as a blank.
    const c = card({ fare: { perAdultUsd: 500 }, history: history(14, 900) });
    expect(c.anatomy!.confidenceIsMeasured).toBe(false);
    expect(c.anatomy!.confidencePct).toBeGreaterThan(0);
    expect(c.anatomy!.confidenceBasis).toMatch(/model score, not a measured hit rate/i);
    expect(c.anatomy!.whatWouldChangeIt.length).toBeGreaterThan(20);
  });

  it('uses a measured hit rate once there is one', () => {
    const c = card({
      fare: { perAdultUsd: 500 }, history: history(14, 900),
      track: { routeFamily: 'JFK → CAI', scored: 40, correct: 30, horizonDays: 14, accuracyPct: 75 },
    });
    expect(c.anatomy!.confidenceIsMeasured).toBe(true);
    expect(c.anatomy!.confidencePct).toBe(75);
    expect(c.anatomy!.confidenceBasis).toContain('30 of 40');
  });
});

describe('position in the 30-day range', () => {
  it('puts the cheapest fare at the left edge and the dearest at the right', () => {
    expect(positionPct(600, 1000, 600)).toBe(0);
    expect(positionPct(600, 1000, 1000)).toBe(100);
    expect(positionPct(600, 1000, 800)).toBe(50);
  });

  it('does not read a flat route as "cheapest ever"', () => {
    // low === high would divide by zero and park the marker hard left, which
    // says "record low" about a route that has not moved all month.
    expect(positionPct(900, 900, 900)).toBe(50);
  });

  it('clamps a fare outside the recorded range', () => {
    expect(positionPct(600, 1000, 400)).toBe(0);
    expect(positionPct(600, 1000, 1400)).toBe(100);
  });
});

describe('the order under the user’s thumb', () => {
  it('puts buys first, then closest to target, then the rest', () => {
    const buy = card({
      row: row({ id: 1 }), fare: { perAdultUsd: 600 },
      history: varied(14, 800, 1200), thresholdPerAdult: 900,
    });
    const near = card({
      row: row({ id: 2, target_per_adult_usd: 1000 }), fare: { perAdultUsd: 1020 },
      history: varied(14, 900, 1100), thresholdPerAdult: 700,
    });
    const far = card({
      row: row({ id: 3, target_per_adult_usd: 500 }), fare: { perAdultUsd: 1400 },
      history: varied(14, 1200, 1500), thresholdPerAdult: 500,
    });
    const paused = card({ row: row({ id: 4, active: 0 }) });

    expect(buy.state).toBe('buy');
    expect(near.state).toBe('decide');
    expect(far.state).toBe('decide');
    expect(sortBoard([paused, far, near, buy]).map(c => c.id)).toEqual([1, 2, 3, 4]);
  });

  it('leads with the buy that also clears the user’s own target', () => {
    // Every buy has rank 0, so without a tie-break the first card is whichever
    // route sorts alphabetically — which put an over-target buy above an
    // under-target one on the first real board we rendered.
    const overTarget = card({
      row: row({ id: 1, target_per_adult_usd: 700 }), fare: { perAdultUsd: 850 },
      history: varied(14, 800, 1200), thresholdPerAdult: 700,
    });
    const underTarget = card({
      row: row({ id: 2, origin: 'ZZZ', target_per_adult_usd: 900 }), fare: { perAdultUsd: 850 },
      history: varied(14, 800, 1200), thresholdPerAdult: 900,
    });
    expect(overTarget.state).toBe('buy');
    expect(underTarget.state).toBe('buy');
    expect(sortBoard([overTarget, underTarget]).map(c => c.id)).toEqual([2, 1]);
  });

  it('sinks paused and expired below everything live', () => {
    const live = card({ row: row({ id: 1 }) });
    const expired = card({ row: row({ id: 2, status: 'expired' }) });
    expect(sortBoard([expired, live])[0].id).toBe(1);
  });

  it('measures distance to target on the basis, both sides', () => {
    expect(distanceToTargetPct(1100, 1000)).toBeCloseTo(10);
    expect(distanceToTargetPct(900, 1000)).toBeCloseTo(-10);
    expect(distanceToTargetPct(900, null)).toBeNull();
    expect(distanceToTargetPct(null, 900)).toBeNull();
    expect(distanceToTargetPct(900, 0)).toBeNull();
  });
});

describe('the line above the board', () => {
  it('counts what it can and says how much it could not answer', () => {
    const buy = card({
      row: row({ id: 1, target_per_adult_usd: 900 }), fare: { perAdultUsd: 600 },
      history: varied(14, 800, 1200), thresholdPerAdult: 900,
    });
    const noTarget = card({
      row: row({ id: 2, target_amount: null, target_per_adult_usd: null }),
      fare: { perAdultUsd: 1150 }, history: varied(14, 800, 1200), thresholdPerAdult: 700,
    });
    const paused = card({ row: row({ id: 3, active: 0 }) });

    const s = boardSummary([buy, noTarget, paused]);
    expect(s.watching).toBe(2);        // the paused one is not being watched
    expect(s.buyNow).toBe(1);
    expect(s.underTarget).toBe(1);
    expect(s.unanswerable).toBe(1);    // no target set, so we do not claim a no
  });
});

describe('lifecycle', () => {
  it('reads a passed departure as expired even when the row still says active', () => {
    const c = card({ row: row({ depart_date: '2026-01-01', return_date: '2026-01-10' }) });
    expect(c.state).toBe('expired');
    expect(c.note).toMatch(/dates have passed/i);
  });

  it('keeps watching a booked trip for a rebooking drop', () => {
    const c = card({ row: row({ status: 'booked' }) });
    expect(c.state).toBe('booked');
    expect(c.note).toMatch(/rebook/i);
  });
});

describe('drawing the target on a per-adult chart', () => {
  it('converts a party target to its per-adult equivalent', () => {
    // Inverts exactly the weighting amountOnBasis uses, so the line lands where
    // the party total would actually cross.
    const c = card({
      row: row({ adults: 2, children: 2, target_amount: 3600, target_basis: 'party_total' }),
    });
    expect(targetPerAdultEquivalent(c.watch)).toBe(900);
  });

  it('weights infants the way the fare does', () => {
    const c = card({
      row: row({ adults: 2, infants: 1, target_amount: 2100, target_basis: 'party_total' }),
    });
    // 2 adults + 0.1 infant = 2.1 adult-equivalents.
    expect(targetPerAdultEquivalent(c.watch)).toBe(1000);
  });

  it('passes a per-adult target straight through', () => {
    const c = card({ row: row({ target_per_adult_usd: 850 }) });
    expect(targetPerAdultEquivalent(c.watch)).toBe(850);
  });

  it('refuses to divide a TRIP target by a head count', () => {
    // A flight-plus-hotel target per adult is not a number that means anything,
    // so the chart draws no line rather than an invented one.
    const c = card({
      row: row({ target_amount: 2500, target_basis: 'trip_total', include_hotel: 1, hotel_nights: 7 }),
    });
    expect(targetPerAdultEquivalent(c.watch)).toBeNull();
  });

  it('is null when no target is set', () => {
    const c = card({ row: row({ target_amount: null, target_per_adult_usd: null }) });
    expect(targetPerAdultEquivalent(c.watch)).toBeNull();
  });
});

describe('an any-dates watch', () => {
  it('is flagged so the card never prints its placeholder dates as real ones', () => {
    // The first seeded watch is any-dates with 30/37-day placeholder dates the
    // poller ignores. Rendering "Oct 20 – Oct 27" to a brand-new user says they
    // are flying on a day nobody chose.
    const any = card({ row: row({ date_mode: 'any' }) });
    expect(any.watch.anyDates).toBe(true);
    const exact = card({ row: row({ date_mode: 'exact' }) });
    expect(exact.watch.anyDates).toBe(false);
    const legacy = card({ row: row({}) });   // pre-existing rows have no date_mode
    expect(legacy.watch.anyDates).toBe(false);
  });
});

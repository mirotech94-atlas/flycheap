import { describe, it, expect } from 'vitest';
import {
  toWatch, resolveTarget, resolveStatus, amountOnBasis, isUnderTarget,
  computeExpiry, hasExpired, boardRank, basisLabel,
  DEFAULT_TARGET_BASIS, INFANT_FARE_RATIO,
  type WatchRow,
} from '@/lib/watch';

/**
 * The Watch is the object everything else is a view over, so the tests here are
 * mostly about what must NOT change: a pre-existing row has to keep meaning
 * exactly what it meant, and a number we cannot compute honestly has to come
 * back as "cannot say" rather than as a confident false.
 */

const row = (over: Partial<WatchRow> = {}): WatchRow => ({
  id: 1, origin: 'JFK', destination: 'CAI',
  depart_date: '2026-07-07', return_date: '2026-07-21',
  adults: 2, infants: 1, ...over,
});

describe('reading a legacy row', () => {
  it('reads an untouched pre-Watch row as a plain active route watch', () => {
    const w = toWatch(row());
    expect(w.kind).toBe('route');
    expect(w.status).toBe('active');
    expect(w.origins).toEqual(['JFK']);
    expect(w.destinations).toEqual(['CAI']);
    expect(w.departWindow).toEqual({ start: '2026-07-07', end: '2026-07-07' });
  });

  it('keeps a legacy per-adult target on the per-adult basis', () => {
    // The one that matters. Re-basing existing watches to party_total would
    // change WHEN every one of them fires — a silent behaviour change in an
    // alert product, which is how you lose the channel.
    const t = resolveTarget(row({ target_per_adult_usd: 900 }));
    expect(t).toEqual({ amount: 900, basis: 'per_adult' });
  });

  it('defaults a NEW target to the party total', () => {
    // "A family of five does not care that the per-adult fare hit $412."
    expect(resolveTarget(row({ target_amount: 2400 })).basis).toBe(DEFAULT_TARGET_BASIS);
    expect(DEFAULT_TARGET_BASIS).toBe('party_total');
  });

  it('prefers an explicit basis over the default', () => {
    expect(resolveTarget(row({ target_amount: 900, target_basis: 'per_adult' })).basis).toBe('per_adult');
  });

  it('ignores a nonsense basis rather than trusting it', () => {
    expect(resolveTarget(row({ target_amount: 900, target_basis: 'per_goat' })).basis).toBe('party_total');
  });
});

describe('a group watch is the same object with an origin array', () => {
  it('reads multiple origins as a group watch without being told', () => {
    const w = toWatch(row({ origins: 'JFK,EWR,BOS' }));
    expect(w.kind).toBe('group');
    expect(w.origins).toEqual(['JFK', 'EWR', 'BOS']);
  });

  it('reads a hotel-inclusive watch as a trip watch', () => {
    expect(toWatch(row({ include_hotel: 1, hotel_nights: 8 })).kind).toBe('trip');
  });

  it('respects an explicit kind over the inferred one', () => {
    expect(toWatch(row({ kind: 'budget', destinations: '' })).kind).toBe('budget');
  });

  it('normalises and tolerates messy arrays', () => {
    expect(toWatch(row({ origins: ' jfk , ,ewr ' })).origins).toEqual(['JFK', 'EWR']);
  });
});

describe('pricing on the watch’s own basis', () => {
  const w = (over: Partial<WatchRow> = {}) => toWatch(row({ adults: 2, children: 2, infants: 1, ...over }));

  it('uses the provider’s quoted party total when there is one', () => {
    const got = amountOnBasis(w({ target_amount: 3000 }), { perAdultUsd: 500, partyTotalUsd: 2050 });
    expect(got).toMatchObject({ amountUsd: 2050, basis: 'party_total', quoted: true });
  });

  it('derives a party total when the provider gives none, and flags it', () => {
    // quoted:false is what tells the UI to STATE the assumption rather than
    // silently quoting adult fares times five.
    const got = amountOnBasis(w({ target_amount: 3000 }), { perAdultUsd: 500 });
    expect(got.quoted).toBe(false);
    expect(got.amountUsd).toBe(500 * 2 + 500 * 2 + 500 * INFANT_FARE_RATIO);
  });

  it('leaves a per-adult watch on the per-adult number', () => {
    const got = amountOnBasis(w({ target_per_adult_usd: 600 }), { perAdultUsd: 500, partyTotalUsd: 2050 });
    expect(got).toMatchObject({ amountUsd: 500, basis: 'per_adult' });
  });

  it('marks a trip total INCOMPLETE when there is no hotel figure', () => {
    // A flight total wearing a trip total's name is exactly the invented number
    // this codebase keeps getting bitten by.
    const got = amountOnBasis(w({ target_amount: 4000, target_basis: 'trip_total' }), { perAdultUsd: 500 });
    expect(got.incomplete).toBe(true);
  });

  it('completes a trip total when a hotel figure is genuinely available', () => {
    const got = amountOnBasis(
      w({ target_amount: 4000, target_basis: 'trip_total' }),
      { perAdultUsd: 500, partyTotalUsd: 2050, hotelTotalUsd: 640 },
    );
    expect(got.incomplete).toBe(false);
    expect(got.amountUsd).toBe(2690);
  });
});

describe('answering "is it under target"', () => {
  it('says nothing when no target is set', () => {
    expect(isUnderTarget(toWatch(row()), { perAdultUsd: 400 })).toBeNull();
  });

  it('says nothing when a trip target cannot be completed', () => {
    // null must never be rendered as "not under target" — it means we cannot say.
    const w = toWatch(row({ target_amount: 4000, target_basis: 'trip_total' }));
    expect(isUnderTarget(w, { perAdultUsd: 400 })).toBeNull();
  });

  it('answers on the party total when that is the basis', () => {
    // The spec's own example: the family of five. A $412 per-adult fare is
    // $2,060 for the party — under a $2,500 party target, over a $2,000 one.
    // The per-adult number alone cannot answer either question.
    const w = toWatch(row({ adults: 5, children: 0, infants: 0, target_amount: 2500 }));
    expect(isUnderTarget(w, { perAdultUsd: 412 })).toBe(true);   // 2060 < 2500
    expect(isUnderTarget(w, { perAdultUsd: 500 })).toBe(false);  // 2500 is not < 2500

    const tighter = toWatch(row({ adults: 5, children: 0, infants: 0, target_amount: 2000 }));
    expect(isUnderTarget(tighter, { perAdultUsd: 412 })).toBe(false); // 2060 > 2000
  });
});

describe('lifecycle', () => {
  const past = '2020-01-01';
  const future = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  it('expires a watch whose window has passed', () => {
    expect(hasExpired(toWatch(row({ depart_date: past, return_date: past })))).toBe(true);
  });

  it('does not expire one still ahead', () => {
    expect(hasExpired(toWatch(row({ depart_date: future, return_date: future })))).toBe(false);
  });

  it('NEVER expires a home route', () => {
    // "A home route never expires and gives you a reason to exist in their inbox
    // permanently" — the headline retention lever.
    const w = toWatch(row({ depart_date: past, return_date: past, is_home_route: 1 }));
    expect(hasExpired(w)).toBe(false);
    expect(computeExpiry(w)).toBeNull();
  });

  it('never expires a budget watch, which is open-ended by nature', () => {
    const w = toWatch(row({ kind: 'budget', depart_date: past, return_date: past }));
    expect(hasExpired(w)).toBe(false);
  });

  it('lets an explicit status win over the active flag', () => {
    expect(resolveStatus(row({ status: 'booked', active: 1 }))).toBe('booked');
    expect(resolveStatus(row({ active: 0 }))).toBe('paused');
    expect(resolveStatus(row({ active: 1 }))).toBe('active');
  });
});

describe('board ordering', () => {
  it('puts buy verdicts first, then closest-to-target, then the rest', () => {
    // "The user's most pressing decision should be the first thing under their
    // thumb" — urgency, not creation date.
    const items = [
      { name: 'far',     verdict: 'wait' as const, distanceToTargetPct: 40 },
      { name: 'buy',     verdict: 'buy' as const,  distanceToTargetPct: 20 },
      { name: 'unknown', verdict: null,            distanceToTargetPct: null },
      { name: 'close',   verdict: 'hold' as const, distanceToTargetPct: 3 },
    ];
    const order = [...items].sort((a, b) => boardRank(a) - boardRank(b)).map(i => i.name);
    expect(order).toEqual(['buy', 'close', 'far', 'unknown']);
  });

  it('sinks paused and expired below everything actionable', () => {
    expect(boardRank({ status: 'expired' })).toBeGreaterThan(boardRank({ status: 'paused' }));
    expect(boardRank({ status: 'paused' })).toBeGreaterThan(boardRank({ verdict: null }));
  });
});

describe('labels', () => {
  it('names each basis the way a person would say it', () => {
    expect(basisLabel('per_adult')).toBe('per adult');
    expect(basisLabel('party_total')).toBe('for the party');
    expect(basisLabel('trip_total')).toBe('for the trip');
  });
});

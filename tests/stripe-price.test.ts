import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { priceIdFor } from '@/lib/stripe';

/**
 * Which price a customer is actually charged.
 *
 * THE BUG: the pricing page has a monthly/yearly switch and sends
 * `?period=year`, but checkout only ever read `plan`. Every yearly purchase
 * was charged the MONTHLY price — someone clicking "$79/year" was billed
 * $9/month — and the two yearly price IDs configured in production were
 * referenced nowhere in the codebase. This is the money path, so it is tested
 * as a pure function rather than trusted to a code read.
 */

const ENV_KEYS = [
  'STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_YEARLY',
  'STRIPE_PRICE_ENT_MONTHLY', 'STRIPE_PRICE_ENT_YEARLY',
  'STRIPE_PRICE_PRO', 'STRIPE_PRICE_ENTERPRISE',
];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const live = () => {
  process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_m';
  process.env.STRIPE_PRICE_PRO_YEARLY = 'price_pro_y';
  process.env.STRIPE_PRICE_ENT_MONTHLY = 'price_ent_m';
  process.env.STRIPE_PRICE_ENT_YEARLY = 'price_ent_y';
};

describe('the customer is charged what they clicked', () => {
  it('charges the yearly price for a yearly purchase', () => {
    live();
    expect(priceIdFor('pro', 'year')).toEqual({ priceId: 'price_pro_y', period: 'year' });
    expect(priceIdFor('enterprise', 'year')).toEqual({ priceId: 'price_ent_y', period: 'year' });
  });

  it('charges the monthly price for a monthly purchase', () => {
    live();
    expect(priceIdFor('pro', 'month')).toEqual({ priceId: 'price_pro_m', period: 'month' });
    expect(priceIdFor('enterprise', 'month')).toEqual({ priceId: 'price_ent_m', period: 'month' });
  });

  it('never charges one plan at the other plan’s price', () => {
    live();
    const ids = new Set([
      priceIdFor('pro', 'month')!.priceId, priceIdFor('pro', 'year')!.priceId,
      priceIdFor('enterprise', 'month')!.priceId, priceIdFor('enterprise', 'year')!.priceId,
    ]);
    expect(ids.size).toBe(4);
  });
});

describe('when a price is missing', () => {
  it('falls back to monthly rather than failing the sale — and SAYS it did', () => {
    // A sale lost is worse than a sale at the wrong cadence, but the caller
    // must record what was really charged or the receipt lies.
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_m';
    expect(priceIdFor('pro', 'year')).toEqual({ priceId: 'price_pro_m', period: 'month' });
  });

  it('returns null when the plan has no price at all', () => {
    expect(priceIdFor('pro', 'month')).toBeNull();
    expect(priceIdFor('enterprise', 'year')).toBeNull();
  });

  it('honours the legacy env names as monthly fallbacks', () => {
    // An older deployment that never had the _MONTHLY names must keep working.
    process.env.STRIPE_PRICE_PRO = 'legacy_pro';
    process.env.STRIPE_PRICE_ENTERPRISE = 'legacy_ent';
    expect(priceIdFor('pro', 'month')!.priceId).toBe('legacy_pro');
    expect(priceIdFor('enterprise', 'month')!.priceId).toBe('legacy_ent');
  });

  it('prefers the explicit name over the legacy one', () => {
    process.env.STRIPE_PRICE_PRO = 'legacy_pro';
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_m';
    expect(priceIdFor('pro', 'month')!.priceId).toBe('price_pro_m');
  });
});

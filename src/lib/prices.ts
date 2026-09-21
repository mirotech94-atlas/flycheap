/**
 * Canonical subscription prices — the one place `pro`/`enterprise` monthly
 * and yearly charges are typed as numbers. `PricingClient.tsx` (headline/sub
 * copy, the period switch's "save up to N%" chip) and `pricing/page.tsx`
 * (the `<meta>` description) both derive from this module rather than each
 * carrying its own copy of the numbers.
 *
 * MUST match the live Stripe prices exactly — these were advertising $5/$20
 * while Stripe charged $9/$39, i.e. users were quoted one price and billed
 * almost double. Verified against the live Stripe API 2026-09-12:
 *   pro monthly 900 · pro yearly 7900 · ent monthly 3900 · ent yearly 29900
 *
 * No 'use client' — this module is imported from both a client component
 * (PricingClient.tsx) and a server component (pricing/page.tsx's metadata).
 */
export type Plan = 'pro' | 'enterprise';
export type Period = 'month' | 'year';

export const PRICES: Record<Plan, Record<Period, number>> = {
  pro:        { month: 9,  year: 79  }, // $79/yr · $29 off vs monthly · ~27% off
  enterprise: { month: 39, year: 299 }, // $299/yr · $169 off vs monthly · ~36% off
};

/**
 * The period switch's "save up to N%" chip, derived from the same formula
 * pricingLabel() uses for the per-plan yearly sub-line, not a second typed
 * number next to it.
 */
export function annualSavingsPct(plan: Plan): number {
  const monthly = PRICES[plan].month;
  const perMonthOnYearly = PRICES[plan].year / 12;
  return Math.round((1 - perMonthOnYearly / monthly) * 100);
}

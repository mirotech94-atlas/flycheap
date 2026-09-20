/**
 * Detectors for the four alert types the portal spec adds.
 *
 * Pure, so each rule can be tested against a price series without a database
 * and without waiting for a real fare to move.
 *
 * The two that matter most:
 *   post-booking drop — "the one people tell their friends about"
 *   window closing    — "prevents the worst outcome in the product, which is a
 *                        user who waited on your advice and ended up paying more"
 */

import type { VerdictKind } from './verdict';

/** A verdict change only counts when it flips TO buy. */
export function detectVerdictChange(opts: {
  previous: VerdictKind | null | undefined;
  current: VerdictKind;
}): boolean {
  // "Wait flips to buy." A buy that decays to hold is not news worth a message;
  // it is the absence of news.
  return opts.previous === 'wait' && opts.current === 'buy';
}

/** Rising, and the model expects it to keep rising. Digest only, never urgent. */
export const TREND_WARNING_SLOPE_PER_DAY = 2;

export function detectTrendWarning(opts: {
  slopePerDay: number;
  currentPrice: number;
  median: number;
  /** Don't warn about a rise on a fare that is still cheap. */
  threshold: number;
}): boolean {
  if (opts.slopePerDay < TREND_WARNING_SLOPE_PER_DAY) return false;
  // Already above the user's target AND above the route's own normal — a rise
  // from a low base is not a warning, it is a fare returning to normal.
  return opts.currentPrice > opts.threshold && opts.currentPrice > opts.median;
}

/**
 * Price fell after a confirmed booking.
 *
 * The rebooking window is what makes this urgent: many fares are changeable for
 * a fee, and a drop worth more than the fee is money the traveller can still
 * recover — but only until they fly.
 */
export const POST_BOOKING_DROP_MIN_PCT = 5;
export const POST_BOOKING_DROP_MIN_USD = 25;

export function detectPostBookingDrop(opts: {
  bookedAmountUsd: number | null | undefined;
  currentAmountUsd: number;
  departed?: boolean;
}): { fires: boolean; savingUsd: number; pct: number } {
  const booked = opts.bookedAmountUsd;
  if (opts.departed || booked == null || !(booked > 0)) {
    return { fires: false, savingUsd: 0, pct: 0 };
  }
  const savingUsd = booked - opts.currentAmountUsd;
  const pct = (savingUsd / booked) * 100;
  // Both floors: a 6% drop on a $90 fare is $5 and not worth an interruption,
  // and a $30 drop on a $3,000 booking is noise.
  const fires = savingUsd >= POST_BOOKING_DROP_MIN_USD && pct >= POST_BOOKING_DROP_MIN_PCT;
  return { fires, savingUsd, pct };
}

/**
 * Departure approaching, nothing booked, and the fare is not expected to improve.
 *
 * Fires ONCE, seven days out. The point is not to sell — it is to stop the
 * product from having advised someone into waiting past the moment where
 * waiting could still pay.
 */
export const WINDOW_CLOSING_DAYS = 7;

export function detectWindowClosing(opts: {
  daysToDeparture: number | null;
  booked: boolean;
  slopePerDay: number;
  /** Has this watch already had its window-closing alert? Fires once, ever. */
  alreadySent: boolean;
}): boolean {
  if (opts.booked || opts.alreadySent) return false;
  if (opts.daysToDeparture == null) return false;
  if (opts.daysToDeparture > WINDOW_CLOSING_DAYS || opts.daysToDeparture < 0) return false;
  // "Fare not expected to improve" — flat or rising. A fare still falling
  // steadily is one where waiting is still the right call, and telling someone
  // to hurry would be the advice this alert exists to avoid giving.
  return opts.slopePerDay >= 0;
}

/**
 * What a window-closing message is allowed to say.
 *
 * Deliberately not urgency theatre. It states the position and leaves the
 * decision with the user, because the alternative — manufactured scarcity — is
 * precisely the thing that makes fare tools untrustworthy.
 */
export function windowClosingMessage(opts: {
  route: string;
  daysToDeparture: number;
  currentPrice: number;
  median: number;
}): string {
  const direction = opts.currentPrice <= opts.median ? 'below' : 'above';
  return `${opts.route} departs in ${opts.daysToDeparture} days and you have not told us you booked. `
    + `It is currently $${Math.round(opts.currentPrice)}, ${direction} its 30-day median of `
    + `$${Math.round(opts.median)}, and it is not trending down. We are not expecting it to improve, `
    + `so this is the last useful thing we can tell you about this trip.`;
}

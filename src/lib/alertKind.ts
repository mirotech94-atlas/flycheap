/**
 * What kind of alert this is — decided ONCE, used everywhere.
 *
 * The monetization spec segments almost everything by alert type: commission
 * per alert type, conversion per alert type, which alerts justify the expensive
 * provider, which routes deserve the poll spend. All of that is worthless if
 * the stored kind and the kind shown to the user disagree.
 *
 * They did disagree. The alert email classified a fare as a mistake fare at
 * render time (its own 70%-of-target / 30%-below-normal rule) while the poller
 * stored every alert as either 'threshold' or — for the price-drop branch,
 * which passed no kind at all — 'threshold' again. So alerts_sent.kind was
 * effectively always 'threshold', and "mistake-fare converts several times
 * better than threshold" was an unanswerable question.
 *
 * Pure and dependency-free so the poller, the email renderer, the bots and the
 * admin dashboards all reach the same verdict from the same inputs.
 */

export type AlertKind =
  | 'threshold'          // fare crosses the user's target, on their basis
  | 'price-drop'         // significant dip vs the route's own normal
  | 'mistake-fare'       // >=3 sigma below the 30-day mean
  | 'anomaly'            // >=10% under the 7-day median, even above target
  | 'ready'              // first price landed on a queued route
  // The four the B2B/portal spec adds. The last two are the strong ones:
  // post-booking drop is what people tell their friends about, and
  // window-closing prevents the worst outcome in the product — a user who
  // waited on our advice and ended up paying more.
  | 'verdict-change'     // wait flipped to buy
  | 'trend-warning'      // rising, and the model expects it to keep rising
  | 'post-booking-drop'  // price fell after a confirmed booking
  | 'window-closing';    // departure near, no booking, no improvement expected

/** Mistake-fare bar: the same one the dashboard radar and the bots already use. */
export const MISTAKE_FARE_TARGET_RATIO = 0.7;
export const MISTAKE_FARE_PCT_BELOW_NORMAL = 30;
/** A 3σ move is an anomaly even when it isn't cheap enough to be a mistake fare. */
export const ANOMALY_Z = 3;

export type ClassifyInput = {
  /** Which branch of the poller fired. */
  branch: 'threshold' | 'price-drop' | 'ready';
  pricePerAdult: number;
  thresholdPerAdult: number;
  /** Percent below the route's normal price, when known. */
  pctBelowNormal?: number | null;
  /** Z-score against the route's own history, when known. */
  zScore?: number | null;
};

/**
 * Classify an alert. Order matters: mistake-fare outranks everything, because
 * it changes how the alert is worded, how fast it must be sent, and which
 * provider is worth paying to verify it.
 */
export function classifyAlert(input: ClassifyInput): AlertKind {
  const { branch, pricePerAdult, thresholdPerAdult, pctBelowNormal, zScore } = input;

  const deepUnderTarget = thresholdPerAdult > 0
    && pricePerAdult < thresholdPerAdult * MISTAKE_FARE_TARGET_RATIO;
  const deepUnderNormal = pctBelowNormal != null
    && pctBelowNormal >= MISTAKE_FARE_PCT_BELOW_NORMAL;

  if (deepUnderTarget || deepUnderNormal) return 'mistake-fare';
  // A large negative z-score without the depth to be a mistake fare is still
  // unusual enough to be worth polling harder and reporting separately.
  if (zScore != null && zScore <= -ANOMALY_Z) return 'anomaly';
  if (branch === 'price-drop') return 'price-drop';
  if (branch === 'ready') return 'ready';
  return 'threshold';
}

/**
 * How urgently an alert wants to reach someone.
 *
 * The spec's own table. Urgency is a property of the ALERT TYPE, not of the
 * user's settings — settings decide which channels are available, urgency
 * decides whether we are allowed to use the loud ones tonight.
 *
 *   immediate  — send now, on every channel the user has
 *   batchable  — send now, but coalesce with anything else pending
 *   digest     — hold for the daily summary
 *   once       — send exactly once for this watch, ever
 */
export type AlertUrgency = 'immediate' | 'batchable' | 'digest' | 'once';

export function urgencyFor(kind: AlertKind, opts: { closeToDeparture?: boolean } = {}): AlertUrgency {
  switch (kind) {
    case 'mistake-fare':      return 'immediate';
    case 'threshold':         return 'immediate';
    case 'ready':             return 'immediate';
    case 'post-booking-drop': return 'immediate';  // the rebooking window matters
    case 'anomaly':           return 'batchable';
    case 'price-drop':        return 'batchable';
    case 'window-closing':    return 'once';       // once, seven days out
    case 'verdict-change':
      // "Digest unless close to departure" — a wait that flips to buy three
      // days before you fly is not a digest item.
      return opts.closeToDeparture ? 'immediate' : 'digest';
    case 'trend-warning':     return 'digest';     // never interrupt for this
  }
}

/** Departure this close makes a verdict change urgent rather than digestible. */
export const CLOSE_TO_DEPARTURE_DAYS = 14;
/** Window-closing fires this far out, once. */
export const WINDOW_CLOSING_DAYS = 7;

/**
 * Is this alert exempt from the daily frequency cap?
 *
 * Only mistake fares. "A glitch fare at 3am is exactly the case where waking
 * someone is correct" — and a cap that silently swallowed the one alert worth
 * $400 would make the cap the most expensive setting in the product.
 */
export function exemptFromFrequencyCap(kind: AlertKind): boolean {
  return kind === 'mistake-fare';
}

/**
 * May this alert break quiet hours?
 *
 * Only a mistake fare, and only when the user opted into exactly that at setup.
 * Waking someone is defensible for a glitch fare they asked to be woken for;
 * it is indefensible for anything else, including a threshold crossing.
 */
export function mayBreakQuietHours(kind: AlertKind, optedIn: boolean): boolean {
  return kind === 'mistake-fare' && optedIn;
}

/** Is this the class of alert that needs the expensive-provider verification pass? */
export function needsPriorityVerification(kind: AlertKind): boolean {
  // A 3σ anomaly is by construction the fare most likely to be wrong or pulled,
  // and the one most likely to be cancelled by the airline after ticketing.
  return kind === 'mistake-fare' || kind === 'anomaly';
}

/** Should the alert carry the "airlines sometimes cancel these" warning? */
export function needsMistakeFareWarning(kind: AlertKind): boolean {
  return kind === 'mistake-fare';
}

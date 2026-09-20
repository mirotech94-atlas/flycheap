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

export type AlertKind = 'threshold' | 'price-drop' | 'mistake-fare' | 'anomaly' | 'ready';

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

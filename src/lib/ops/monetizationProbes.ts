import type { Finding } from './probes';

/**
 * Operational alarms, not dashboards.
 *
 * "Things that should page you rather than sit on a page." A number on a page is
 * only seen when someone looks; these are the five conditions where the gap
 * between happening and being noticed is the whole cost.
 *
 * Pure functions — every threshold is an argument and every branch is testable
 * without a database, matching the rest of probes.ts. The queries that feed
 * them live in the detector.
 */

/** A provider quoting the SAME price for this long is not stable, it is stuck. */
export const STALE_PROVIDER_MINUTES = 60;
/** Dead-fare rate above this means the engine is promising fares that aren't there. */
export const DEAD_FARE_RATE_PCT = 5;
/** Daily poll spend this many times the trailing average is a runaway. */
export const COST_SPIKE_MULTIPLE = 3;
/** Commission reporting silent this long means the network feed has broken. */
export const COMMISSION_QUIET_DAYS = 4;
/** Share of an alert batch that may fail to deliver before it is an incident. */
export const ALERT_DELIVERY_FAILURE_PCT = 20;

/**
 * A provider returning stale or identical prices for over an hour.
 *
 * This is the dangerous failure mode, because it is invisible: a provider that
 * errors is caught by the poll-success rate, but one that keeps answering with
 * a frozen number looks exactly like a market that isn't moving. Every alert
 * decision downstream is then made against a price that stopped being real.
 */
export function probeStaleProvider(
  rows: Array<{ provider: string; distinct_prices: number; samples: number; span_minutes: number }>,
  minMinutes = STALE_PROVIDER_MINUTES,
): Finding[] {
  return rows
    // Needs enough samples to distinguish "frozen" from "quiet". Two identical
    // polls an hour apart is a slow route, not a broken provider.
    .filter(r => r.distinct_prices <= 1 && r.samples >= 4 && r.span_minutes >= minMinutes)
    .map(r => ({
      fingerprint: `monetization:stale-provider:${r.provider}`,
      source: 'health' as const,
      title: `Provider ${r.provider} has returned one price for ${Math.round(r.span_minutes)} minutes`,
      detail:
        `${r.samples} polls over ${Math.round(r.span_minutes)} min produced ${r.distinct_prices} distinct price(s). ` +
        `A provider that keeps answering with a frozen number looks exactly like a stable market, ` +
        `so every alert decision downstream is being made against a price that may have stopped being real.`,
    }));
}

/** Dead-fare rate crossing its threshold. */
export function probeDeadFareRate(
  stats: { suppressed: number; considered: number } | null,
  thresholdPct = DEAD_FARE_RATE_PCT,
): Finding[] {
  if (!stats || stats.considered < 10) return []; // too few to mean anything
  const pct = (stats.suppressed / stats.considered) * 100;
  if (pct < thresholdPct) return [];
  return [{
    fingerprint: 'monetization:dead-fare-rate',
    source: 'health',
    title: `Dead-fare rate is ${pct.toFixed(1)}% (target under 2%)`,
    detail:
      `${stats.suppressed} of ${stats.considered} alert opportunities were suppressed because verification ` +
      `could not confirm the fare. The suppression is working — but a rate this high means the poll is ` +
      `finding prices the verification pass cannot reproduce, which is a provider problem, not a fare one.`,
  }];
}

/** A poll cost spike. */
export function probeCostSpike(
  today: number,
  trailingAvg: number,
  multiple = COST_SPIKE_MULTIPLE,
): Finding[] {
  // A trailing average near zero makes any spend look like an infinite spike;
  // require a real baseline and a spend worth waking up for.
  if (trailingAvg < 0.5 || today < 1) return [];
  if (today < trailingAvg * multiple) return [];
  return [{
    fingerprint: 'monetization:poll-cost-spike',
    source: 'health',
    title: `Poll spend today is $${today.toFixed(2)} against a $${trailingAvg.toFixed(2)} daily average`,
    detail:
      `${(today / trailingAvg).toFixed(1)}x the trailing average. Usual causes: a route stuck in the hot ` +
      `band re-verifying a fare that never confirms, a provider routing change, or a burst of new tracked ` +
      `routes. Check spend by phase on the economics dashboard — a large 'verify' share points at the first.`,
  }];
}

/** Commission reporting going quiet. */
export function probeCommissionQuiet(
  daysSinceLastEvent: number | null,
  hasClicks: boolean,
  quietDays = COMMISSION_QUIET_DAYS,
): Finding[] {
  // No clicks means no commissions are DUE; silence is correct, not broken.
  if (!hasClicks) return [];
  if (daysSinceLastEvent == null || daysSinceLastEvent < quietDays) return [];
  return [{
    fingerprint: 'monetization:commission-quiet',
    source: 'health',
    title: `No commission events for ${Math.floor(daysSinceLastEvent)} days, but click-outs are still happening`,
    detail:
      `The network feed has probably broken rather than the revenue having stopped — an expired API ` +
      `credential or a changed report endpoint. Hotel commissions settle weeks after checkout, so some lag ` +
      `is normal; total silence alongside live clicks is not.`,
  }];
}

/** An alert batch where more than a small share failed to deliver. */
export function probeAlertDeliveryFailures(
  stats: { attempted: number; failed: number } | null,
  thresholdPct = ALERT_DELIVERY_FAILURE_PCT,
): Finding[] {
  if (!stats || stats.attempted < 5) return [];
  const pct = (stats.failed / stats.attempted) * 100;
  if (pct < thresholdPct) return [];
  return [{
    fingerprint: 'monetization:alert-delivery',
    source: 'health',
    title: `${pct.toFixed(0)}% of alerts failed to deliver in the last batch`,
    detail:
      `${stats.failed} of ${stats.attempted} alerts reached no channel at all. Usual causes: the sending ` +
      `domain is unverified, the ESP key has rotated, or a provider is rate-limiting. Every one of these is ` +
      `a fare someone was watching for and did not hear about.`,
  }];
}

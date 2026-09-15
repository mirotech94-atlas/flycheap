/**
 * Buy / Wait / Hold verdict — pure, deterministic, client-safe (no DB, no
 * `server-only`). Shared by the dashboard Route DNA card, the legacy
 * PricePrediction card and anything else that wants a one-line call.
 *
 * Inputs are the same three things the old PricePrediction used: a 30-day
 * price history (daily minimums are fine), the current price, and the user's
 * target. Every figure in the output is derived from that history — nothing
 * is invented:
 *
 *   - trendPct      recent-half average vs older-half average (existing rule)
 *   - slopePerDay   least-squares slope of price over day index
 *   - zScore        (current − mean) / sample stddev — same math as the
 *                   mistake-fare detector in db.fareStats
 *   - percentile    share of observed prices at or below the current price
 *   - p25 / p75     "typical range" band (Google pattern)
 *   - confidencePct heuristic agreement score (see confidenceFor) — clamped
 *                   55–95 so it never reads as a false certainty
 *   - expectedSavings only when verdict === 'wait' AND the slope / z-score
 *                   support a figure; otherwise null and the UI omits it.
 */

export type VerdictKind = 'buy' | 'wait' | 'hold';

export type VerdictPoint = { polled_at: string; price_per_adult_usd: number };

export type Verdict = {
  verdict: VerdictKind;
  label: string;            // "Buy now" | "Wait" | "Hold"
  confidencePct: number;    // 55–95
  reason: string;
  currentPrice: number;
  threshold: number;
  min: number;
  max: number;
  median: number;
  mean: number;
  stddev: number;
  p25: number;
  p75: number;
  percentile: number;       // 0–100, share of history at/below current
  positionInRange: number;  // 0–1 within [min, max]
  trendPct: number;
  slopePerDay: number;      // USD per day (negative = falling)
  zScore: number;
  vsThresholdPct: number;
  samples: number;
  /** Projected saving if you wait ~7 days. null when the math can't support it. */
  expectedSavings: number | null;
  /** Horizon (days) the expectedSavings projection covers. */
  savingsHorizonDays: number;
};

export const MIN_VERDICT_SAMPLES = 4;

/** Key used to hand per-route history + verdict maps to the Route DNA card. */
export function routeKey(origin: string, dest: string): string { return `${origin}-${dest}`; }

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Day offset of each point from the first one (falls back to index when dates are unparsable). */
function dayIndex(history: VerdictPoint[]): number[] {
  const t0 = Date.parse(history[0]?.polled_at ?? '');
  return history.map((h, i) => {
    const t = Date.parse(h.polled_at);
    if (Number.isNaN(t0) || Number.isNaN(t)) return i;
    return (t - t0) / 86_400_000;
  });
}

/** Least-squares slope (USD/day) of price over day index. 0 when degenerate. */
function slopeOf(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den > 0 ? num / den : 0;
}

/**
 * Confidence as an agreement score between the independent signals. Starts
 * at 50 and adds points for a strong trend, an extreme position in the range,
 * a large |z|, and penalises thin history. Clamped to 55–95.
 */
function confidenceFor(opts: { trendPct: number; positionInRange: number; zScore: number; samples: number }): number {
  let c = 50;
  c += Math.min(20, Math.abs(opts.trendPct) * 2);               // 0–20
  c += Math.abs(opts.positionInRange - 0.5) * 40;               // 0–20
  c += Math.min(15, Math.abs(opts.zScore) * 7.5);               // 0–15
  if (opts.samples < 8) c -= 10; else if (opts.samples < 15) c -= 5;
  return Math.round(Math.max(55, Math.min(95, c)));
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function computeVerdict(
  history: VerdictPoint[],
  currentPrice: number,
  threshold: number,
): Verdict | null {
  if (!currentPrice || !Number.isFinite(currentPrice) || history.length < MIN_VERDICT_SAMPLES) return null;

  const ordered = [...history].sort((a, b) => a.polled_at.localeCompare(b.polled_at));
  const prices = ordered.map(h => h.price_per_adult_usd);
  const sorted = [...prices].sort((a, b) => a - b);
  const n = prices.length;

  const min = sorted[0];
  const max = sorted[n - 1];
  const median = quantile(sorted, 0.5);
  const p25 = quantile(sorted, 0.25);
  const p75 = quantile(sorted, 0.75);
  const mean = prices.reduce((s, p) => s + p, 0) / n;
  const variance = n > 1 ? prices.reduce((s, p) => s + (p - mean) ** 2, 0) / (n - 1) : 0;
  const stddev = Math.sqrt(variance);
  const zScore = stddev > 0 ? (currentPrice - mean) / stddev : 0;

  // Recent-half vs older-half trend — same rule the old card used.
  const cutoff = Math.floor(n / 2);
  const recent = prices.slice(cutoff);
  const older = prices.slice(0, cutoff);
  const recentAvg = recent.reduce((s, p) => s + p, 0) / recent.length;
  const olderAvg = older.length ? older.reduce((s, p) => s + p, 0) / older.length : recentAvg;
  const trendPct = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

  const slopePerDay = slopeOf(dayIndex(ordered), prices);

  const range = max - min;
  const positionInRange = range > 0 ? Math.max(0, Math.min(1, (currentPrice - min) / range)) : 0;
  const atOrBelow = sorted.filter(p => p <= currentPrice).length;
  const percentile = Math.round((atOrBelow / n) * 100);
  const vsThresholdPct = threshold > 0 ? ((currentPrice - threshold) / threshold) * 100 : 0;

  // ---- Decision rules (unchanged from PricePrediction; 'watch' renamed 'hold') ----
  let verdict: VerdictKind;
  let reason: string;
  if (currentPrice <= min * 1.03 && vsThresholdPct < 5) {
    verdict = 'buy';
    reason = `At ${positionInRange < 0.05 ? 'the' : 'near the'} 30-day low (${fmt(min)}). ${vsThresholdPct < 0 ? 'Below' : 'At'} your target.`;
  } else if (trendPct > 5 && positionInRange < 0.4) {
    verdict = 'buy';
    reason = `Rising +${trendPct.toFixed(0)}% lately but still in the lower third of recent prices. Lock it in.`;
  } else if (trendPct < -5 && positionInRange > 0.6) {
    verdict = 'wait';
    reason = `Falling ${trendPct.toFixed(0)}% in the recent window — likely keeps dropping. ${fmt(currentPrice - min)} above the 30d low.`;
  } else if (vsThresholdPct > 30) {
    verdict = 'wait';
    reason = `${fmt(currentPrice - threshold)} above your ${fmt(threshold)} target. 30d median is ${fmt(median)}.`;
  } else if (positionInRange < 0.3) {
    verdict = 'buy';
    reason = `Bottom third of the 30d range — good value historically.`;
  } else {
    verdict = 'hold';
    reason = `Mid-range price, no strong trend. We'll alert if it drops below ${fmt(threshold)} or 10% below median.`;
  }

  const confidencePct = confidenceFor({ trendPct, positionInRange, zScore, samples: n });

  // ---- Expected savings if waiting (Wait only) ----
  // Two supporting estimates, take the larger; omit when neither supports ≥ $5.
  //   1. Trend projection: extend the least-squares slope 7 days, floored at
  //      the 30d low (we never project below what the route has actually done).
  //   2. Mean reversion: when the current price sits above the mean (z > 0.5),
  //      expect a drift back toward the median.
  const savingsHorizonDays = 7;
  let expectedSavings: number | null = null;
  if (verdict === 'wait') {
    const projected = currentPrice + slopePerDay * savingsHorizonDays;
    const viaTrend = slopePerDay < 0 ? currentPrice - Math.max(min, projected) : 0;
    const viaRevert = zScore > 0.5 ? currentPrice - median : 0;
    const best = Math.max(viaTrend, viaRevert);
    const capped = Math.min(best, currentPrice - min);
    if (capped >= 5) expectedSavings = Math.round(capped);
  }

  const label = verdict === 'buy' ? 'Buy now' : verdict === 'wait' ? 'Wait' : 'Hold';

  return {
    verdict, label, confidencePct, reason,
    currentPrice, threshold,
    min, max, median, mean, stddev, p25, p75,
    percentile, positionInRange, trendPct, slopePerDay, zScore, vsThresholdPct,
    samples: n,
    expectedSavings, savingsHorizonDays,
  };
}

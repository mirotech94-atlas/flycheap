import 'server-only';
import { queries } from './db';

export type Recommendation = {
  verdict: 'BUY' | 'HOLD' | 'WAIT' | 'INSUFFICIENT_DATA';
  confidence: number; // 0..100
  reason: string;
  current: number;
  mean30: number;
  stddev30: number;
  z: number; // (current - mean) / stddev
  slope14: number; // $/day trend over last 14d (positive = rising)
};

/**
 * Buy / Hold / Wait recommendation based on snapshot history.
 *
 * Signals (all observable from fare_snapshots):
 *   z       — z-score of current price vs 30d mean+σ
 *   slope14 — linear regression slope of price over last 14 days
 *
 * Rules:
 *   BUY   if z <= -1.0 AND slope14 >= 0    (cheap *and* not falling further)
 *   WAIT  if z >  -0.5 AND slope14 <  -1   (above mean and trending down)
 *   HOLD  otherwise
 *
 * Confidence rises with sample size and signal magnitude; capped at 90.
 */
export function recommendFor(searchId: number, currentPerAdult: number): Recommendation {
  const stats = queries.fareStats(searchId, 30);
  if (stats.n < 14 || stats.stddev <= 0) {
    return {
      verdict: 'INSUFFICIENT_DATA',
      confidence: Math.min(40, stats.n * 3),
      reason: `Need ≥14 snapshots over 30d; have ${stats.n}.`,
      current: currentPerAdult, mean30: stats.mean, stddev30: stats.stddev, z: 0, slope14: 0,
    };
  }

  const z = (currentPerAdult - stats.mean) / stats.stddev;

  // 14-day slope via simple least-squares on (day_index, price) pairs.
  const history = queries.fareHistory(searchId, 14);
  let slope14 = 0;
  if (history.length >= 4) {
    const n = history.length;
    const t0 = new Date(history[0].polled_at + 'Z').getTime();
    const dayMs = 86_400_000;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const h of history) {
      const x = (new Date(h.polled_at + 'Z').getTime() - t0) / dayMs;
      const y = h.price_per_adult_usd;
      sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom !== 0) slope14 = (n * sumXY - sumX * sumY) / denom; // $/day
  }

  let verdict: Recommendation['verdict'];
  let reason: string;

  if (z <= -1.0 && slope14 >= 0) {
    verdict = 'BUY';
    reason = `${Math.abs(z).toFixed(1)}σ below 30-day mean ($${Math.round(stats.mean)}) and not falling — book before it bounces.`;
  } else if (z > -0.5 && slope14 < -1) {
    verdict = 'WAIT';
    reason = `Price is trending down ${Math.abs(slope14).toFixed(1)}$/day and still near mean — likely cheaper soon.`;
  } else if (z <= -0.5) {
    verdict = 'BUY';
    reason = `Below average ($${Math.round(stats.mean)}) — modestly good time to book.`;
  } else if (slope14 < -2) {
    verdict = 'WAIT';
    reason = `Strong downward trend (${slope14.toFixed(1)}$/day) — hold a few days.`;
  } else {
    verdict = 'HOLD';
    reason = `Near 30-day mean ($${Math.round(stats.mean)}), no strong trend.`;
  }

  // Confidence = scaled magnitude of signals + log(sample size). Capped.
  const signalStrength = Math.min(1, Math.max(Math.abs(z) / 2, Math.abs(slope14) / 5));
  const sampleConfidence = Math.min(1, Math.log10(Math.max(stats.n, 1)) / 2); // 100 → 1.0
  const confidence = Math.min(90, Math.round((0.6 * signalStrength + 0.4 * sampleConfidence) * 100));

  return {
    verdict,
    confidence,
    reason,
    current: currentPerAdult,
    mean30: stats.mean,
    stddev30: stats.stddev,
    z,
    slope14,
  };
}

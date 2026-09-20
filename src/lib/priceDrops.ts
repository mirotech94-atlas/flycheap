import 'server-only';
import { getDb, queries } from './db';

export type PriceDropResult = {
  isDrop: boolean;
  pctBelowMedian: number;
  median7d: number | null;
  reason: string;
};

/**
 * A "price drop" fires when today's cheapest is at least `dropPct` % below
 * the 7-day median for the same search — and we haven't already alerted on
 * an equal-or-lower price recently.
 */
/**
 * The route's "normal" price: median per-adult fare over the last 7 days,
 * excluding the most recent hour so the poll that triggered an alert doesn't
 * drag its own baseline down. Returns null with < 3 polls. Shared by the
 * anomaly detector below and the alert email ("normal $X → now $Y").
 */
export function median7dForSearch(searchId: number): number | null {
  const rows = getDb().prepare(
    `SELECT price_per_adult_usd FROM fare_snapshots
     WHERE search_id = ?
       AND polled_at >= datetime('now', '-7 days')
       AND polled_at <  datetime('now', '-1 hour')
       AND COALESCE(verify_outcome, 'ok') <> 'dead'
     ORDER BY price_per_adult_usd`
  ).all(searchId) as Array<{ price_per_adult_usd: number }>;
  if (rows.length < 3) return null;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2
    ? rows[mid].price_per_adult_usd
    : (rows[mid - 1].price_per_adult_usd + rows[mid].price_per_adult_usd) / 2;
}

export function detectPriceDrop(
  searchId: number,
  todayPricePerAdult: number,
  dropPct: number,
  floorDays?: number,
): PriceDropResult {
  const median = median7dForSearch(searchId);
  if (median === null) {
    return { isDrop: false, pctBelowMedian: 0, median7d: null, reason: 'not enough history (need ≥3 polls in 7d)' };
  }

  const pctBelow = ((median - todayPricePerAdult) / median) * 100;

  if (pctBelow < dropPct) {
    return { isDrop: false, pctBelowMedian: pctBelow, median7d: median, reason: `only ${pctBelow.toFixed(1)}% below median (need ${dropPct}%)` };
  }

  // Same decaying floor the threshold branch uses. Without a window this
  // check re-created the ratchet here: every active route was pinned to a
  // historic alert price (EWR-DXB to $361 from 2026-08-01) and a genuine
  // 10%-below-median drop was thrown away because it did not also beat that
  // old low. Bounding the lookup lets the floor age out.
  const last = queries.lastAlertForSearch(searchId, floorDays);
  if (last && todayPricePerAdult >= last.price_per_adult_usd) {
    return { isDrop: false, pctBelowMedian: pctBelow, median7d: median, reason: 'already alerted on equal/lower price' };
  }

  return { isDrop: true, pctBelowMedian: pctBelow, median7d: median, reason: 'qualifies' };
}

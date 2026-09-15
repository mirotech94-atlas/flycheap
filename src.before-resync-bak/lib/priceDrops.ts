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
export function detectPriceDrop(
  searchId: number,
  todayPricePerAdult: number,
  dropPct: number,
): PriceDropResult {
  const rows = getDb().prepare(
    `SELECT price_per_adult_usd FROM fare_snapshots
     WHERE search_id = ?
       AND polled_at >= datetime('now', '-7 days')
       AND polled_at <  datetime('now', '-1 hour')
     ORDER BY price_per_adult_usd`
  ).all(searchId) as Array<{ price_per_adult_usd: number }>;

  if (rows.length < 3) {
    return { isDrop: false, pctBelowMedian: 0, median7d: null, reason: 'not enough history (need ≥3 polls in 7d)' };
  }

  const mid = Math.floor(rows.length / 2);
  const median = rows.length % 2
    ? rows[mid].price_per_adult_usd
    : (rows[mid - 1].price_per_adult_usd + rows[mid].price_per_adult_usd) / 2;

  const pctBelow = ((median - todayPricePerAdult) / median) * 100;

  if (pctBelow < dropPct) {
    return { isDrop: false, pctBelowMedian: pctBelow, median7d: median, reason: `only ${pctBelow.toFixed(1)}% below median (need ${dropPct}%)` };
  }

  const last = queries.lastAlertForSearch(searchId);
  if (last && todayPricePerAdult >= last.price_per_adult_usd) {
    return { isDrop: false, pctBelowMedian: pctBelow, median7d: median, reason: 'already alerted on equal/lower price' };
  }

  return { isDrop: true, pctBelowMedian: pctBelow, median7d: median, reason: 'qualifies' };
}

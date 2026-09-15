import 'server-only';
import { queries, type SearchRow, type FareRow } from './db';

export type DashboardRow = {
  search: SearchRow;
  fare: FareRow | null;
  history: Array<{ polled_at: string; price_per_adult_usd: number }>;
  threshold: number;
  underThreshold: boolean;
};

export function loadDashboard(opts?: { userId?: number; threshold?: number }): DashboardRow[] {
  const threshold = opts?.threshold ?? parseFloat(
    (opts?.userId && queries.getUserSetting(opts.userId, 'alert_threshold_per_adult_usd')) ||
    queries.getSetting('alert_threshold_per_adult_usd') || '900'
  );
  const all = opts?.userId
    ? queries.listSearchesForUser(opts.userId)
    : queries.listSearches();
  const searches = all.filter(s => s.active === 1);
  return searches.map(s => {
    const fare = queries.latestFare(s.id) ?? null;
    const hist = queries.fareHistory(s.id, 30).map(h => ({
      polled_at: h.polled_at,
      price_per_adult_usd: h.price_per_adult_usd,
    }));
    return {
      search: s,
      fare,
      history: hist,
      threshold,
      underThreshold: fare ? fare.price_per_adult_usd < threshold : false,
    };
  });
}

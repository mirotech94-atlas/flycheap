import 'server-only';
import { getDb, queries, type SearchRow, type FareRow } from './db';
import { effectiveTarget } from './targets';

export type DashboardRow = {
  search: SearchRow;
  fare: FareRow | null;
  history: Array<{ polled_at: string; price_per_adult_usd: number }>;
  threshold: number;
  underThreshold: boolean;
};

export function loadDashboard(opts?: {
  userId?: number;
  threshold?: number;
  limit?: number;
  includeHistory?: boolean;
}): DashboardRow[] {
  const threshold = opts?.threshold ?? parseFloat(
    (opts?.userId && queries.getUserSetting(opts.userId, 'alert_threshold_per_adult_usd')) ||
    queries.getSetting('alert_threshold_per_adult_usd') || '900'
  );
  const includeHistory = opts?.includeHistory ?? true;
  const searches = opts?.userId
    ? queries.listActiveSearchesForUser(opts.userId)
    : opts?.limit
      ? queries.listActiveSearchesPreview(opts.limit)
      : queries.listActiveSearches();
  const ids = searches.map(s => s.id);
  const latestBySearch = new Map<number, FareRow>();
  const historyBySearch = new Map<number, Array<{ polled_at: string; price_per_adult_usd: number }>>();

  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const db = getDb();
    // One indexed LIMIT-1 lookup per search (µs each) instead of a window
    // function over every snapshot — the latter re-sorts the whole table
    // (~1.8s at 200k rows) on every dashboard render.
    const latestStmt = db.prepare(
      `SELECT * FROM fare_snapshots
       WHERE search_id = ?
       ORDER BY polled_at DESC, id DESC
       LIMIT 1`
    );
    for (const id of ids) {
      const row = latestStmt.get(id) as FareRow | undefined;
      if (row) latestBySearch.set(row.search_id, row);
    }

    // Daily minimum, not every snapshot: frequent polling × 30 days × N searches
    // is ~200k points that get serialized into client props on every page render
    // (~18 MB HTML). Sparklines can't show sub-daily detail anyway.
    // Filtering on date(polled_at) (not raw polled_at) lets SQLite resolve the
    // whole query from the covering idx_fare_search_day_price expression index.
    const historyRows = includeHistory ? db.prepare(
      `SELECT search_id, date(polled_at) AS polled_at, MIN(price_per_adult_usd) AS price_per_adult_usd
       FROM fare_snapshots
       WHERE search_id IN (${placeholders})
         AND date(polled_at) >= date('now', '-30 days')
       GROUP BY search_id, date(polled_at)
       ORDER BY search_id, polled_at`
    ).all(...ids) as Array<{ search_id: number; polled_at: string; price_per_adult_usd: number }> : [];

    for (const h of historyRows) {
      const arr = historyBySearch.get(h.search_id) ?? [];
      arr.push({ polled_at: h.polled_at, price_per_adult_usd: h.price_per_adult_usd });
      historyBySearch.set(h.search_id, arr);
    }
  }

  return searches.map(s => {
    const fare = latestBySearch.get(s.id) ?? null;
    const hist = historyBySearch.get(s.id) ?? [];
    // Per-route target overrides the user/global default for this row.
    const target = effectiveTarget(s, threshold);
    return {
      search: s,
      fare,
      history: hist,
      threshold: target,
      underThreshold: fare ? fare.price_per_adult_usd < target : false,
    };
  });
}

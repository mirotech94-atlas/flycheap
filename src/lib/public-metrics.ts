import 'server-only';
import { getDb, queries } from './db';
import { providerStatuses } from './providers';

/**
 * The one set of numbers every public surface (landing, login, /status,
 * /api/health) quotes. Everything here is read live from production so the
 * marketing can never drift from what /status shows.
 */
export type PublicMetrics = {
  snapshots: number;          // total fare snapshots recorded
  activeRoutes: number;       // searches currently being polled
  routePairs: number;         // distinct origin→destination pairs in the 12-month scan
  airlinesSeen: number;       // distinct IATA carrier codes observed in recorded fares (not a provider's catalogue claim)
  alertsSent: number;
  providersConfigured: string[];
  providersTotal: number;
  lastPollAgoMin: number | null;
  cheapest: { origin: string; dest: string; per: number; out: string; ret: string } | null;
  ticker: Array<{ route: string; price: number; delta: number }>;   // real best fares vs their route median
  topDeals: Array<{
    origin: string; dest: string; out: string; ret: string; trip: number;
    per: number; party: number; median: number; provider: string;
    outDow: number; outHour: number; retDow: number; retHour: number;
  }>;
  recentAlerts: Array<{ route: string; price: number; kind: string; ts: number }>;
};

const EMPTY: PublicMetrics = {
  snapshots: 0, activeRoutes: 0, routePairs: 0, airlinesSeen: 0, alertsSent: 0,
  providersConfigured: [], providersTotal: 0, lastPollAgoMin: null,
  cheapest: null, ticker: [], topDeals: [], recentAlerts: [],
};

export function getPublicMetrics(): PublicMetrics {
  try {
    const db = getDb();
    const one = <T,>(sql: string) => db.prepare(sql).get() as T;

    const snapshots = one<{ n: number }>('SELECT COUNT(*) AS n FROM fare_snapshots').n;
    const activeRoutes = one<{ n: number }>('SELECT COUNT(*) AS n FROM searches WHERE active = 1').n;
    const routePairs = one<{ n: number }>('SELECT COUNT(DISTINCT origin || destination) AS n FROM best_deals_cache').n;
    const alertsSent = one<{ n: number }>(`SELECT COUNT(*) AS n FROM alerts_sent WHERE status = 'sent'`).n;
    // Airlines are counted from the carrier prefix of flight numbers we have
    // actually recorded. The old copy claimed "1,000+ airlines" — a metasearch
    // catalogue figure nothing in this codebase could measure or stand behind.
    // Empty flight numbers (some Travelpayouts rows) simply do not count.
    const airlinesSeen = one<{ n: number }>(`
      WITH c AS (
        SELECT UPPER(SUBSTR(TRIM(outbound_flight_no), 1, 2)) AS k FROM fare_snapshots WHERE LENGTH(TRIM(outbound_flight_no)) >= 3
        UNION SELECT UPPER(SUBSTR(TRIM(return_flight_no), 1, 2)) FROM fare_snapshots WHERE LENGTH(TRIM(return_flight_no)) >= 3
        UNION SELECT UPPER(SUBSTR(TRIM(outbound_flight_no), 1, 2)) FROM best_deals_cache WHERE LENGTH(TRIM(outbound_flight_no)) >= 3
        UNION SELECT UPPER(SUBSTR(TRIM(return_flight_no), 1, 2)) FROM best_deals_cache WHERE LENGTH(TRIM(return_flight_no)) >= 3
      ) SELECT COUNT(*) AS n FROM c WHERE k GLOB '[A-Z0-9][A-Z0-9]'
    `).n;
    const lastPoll = one<{ t: string | null }>('SELECT MAX(polled_at) AS t FROM fare_snapshots').t;
    const lastPollAgoMin = lastPoll ? Math.max(0, Math.round((Date.now() - new Date(lastPoll.replace(' ', 'T') + 'Z').getTime()) / 60000)) : null;

    const provs = providerStatuses();
    // "Configured" only means an API key exists in the environment — it does
    // NOT mean the provider is polled. The public landing page renders this
    // number under the word "polled", so it must be the ENABLED set or we are
    // telling visitors we poll four sources when we poll one.
    const enabledIds = new Set(
      (queries.getSetting('enabled_providers') ?? 'travelpayouts')
        .split(',').map((x: string) => x.trim()).filter(Boolean),
    );
    const providersConfigured = provs
      .filter(p => p.isConfigured && enabledIds.has(p.id))
      .map(p => p.id);

    type DealRow = {
      origin: string; destination: string; outbound_date: string; return_date: string;
      trip_length_days: number; per_adult_usd: number; party_total_usd: number; provider: string;
      outbound_dow: number; outbound_hour: number; return_dow: number; return_hour: number; median: number;
    };
    // Cheapest pairing per route, with that route's median so we can show a
    // defensible "vs typical" delta instead of an invented one.
    const dealRows = db.prepare(`
      SELECT b.origin, b.destination, b.outbound_date, b.return_date, b.trip_length_days,
             b.per_adult_usd, b.party_total_usd, b.provider,
             b.outbound_dow, b.outbound_hour, b.return_dow, b.return_hour,
             (SELECT AVG(per_adult_usd) FROM best_deals_cache m
               WHERE m.origin = b.origin AND m.destination = b.destination) AS median
      FROM best_deals_cache b
      WHERE b.id IN (
        SELECT id FROM best_deals_cache x
        WHERE x.origin = b.origin AND x.destination = b.destination
        ORDER BY x.per_adult_usd ASC LIMIT 1
      )
      ORDER BY b.per_adult_usd ASC
      LIMIT 8
    `).all() as DealRow[];

    const topDeals = dealRows.map(r => ({
      origin: r.origin, dest: r.destination, out: r.outbound_date, ret: r.return_date,
      trip: r.trip_length_days, per: Math.round(r.per_adult_usd), party: Math.round(r.party_total_usd),
      median: Math.round(r.median), provider: r.provider,
      outDow: r.outbound_dow, outHour: r.outbound_hour, retDow: r.return_dow, retHour: r.return_hour,
    }));

    const ticker = topDeals.map(d => ({
      route: `${d.origin} → ${d.dest}`, price: d.per, delta: d.per - d.median,
    }));

    const cheapest = topDeals[0]
      ? { origin: topDeals[0].origin, dest: topDeals[0].dest, per: topDeals[0].per, out: topDeals[0].out, ret: topDeals[0].ret }
      : null;

    const alertRows = db.prepare(`
      SELECT s.origin, s.destination, a.price_per_adult_usd AS price, a.kind, a.sent_at
      FROM alerts_sent a JOIN searches s ON s.id = a.search_id
      WHERE a.status = 'sent'
      ORDER BY a.sent_at DESC LIMIT 6
    `).all() as Array<{ origin: string; destination: string; price: number; kind: string; sent_at: string }>;
    const recentAlerts = alertRows.map(a => ({
      route: `${a.origin} → ${a.destination}`, price: Math.round(a.price), kind: a.kind,
      ts: new Date(a.sent_at.replace(' ', 'T') + 'Z').getTime(),
    }));

    return {
      snapshots, activeRoutes, routePairs, airlinesSeen, alertsSent,
      providersConfigured, providersTotal: provs.length, lastPollAgoMin,
      cheapest, ticker, topDeals, recentAlerts,
    };
  } catch {
    return EMPTY;
  }
}

export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

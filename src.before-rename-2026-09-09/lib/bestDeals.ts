import 'server-only';
import { getDb, queries } from './db';
import { enabledProviderIds, searchAllProviders, searchProviders } from './providers';

// Multi-destination best-deals scanner. For each tracked (origin, destination)
// pair we scan N months ahead for the cheapest round-trip pairings. Travelpayouts
// is unmetered for affiliates, so 24-48 calls per refresh is fine per dest.

const ENDPOINT = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const INFANT_FARE_RATIO = 0.1;

// Default fallback (used when the user has no active tracked searches).
const DEFAULT_DESTINATION = 'CAI';
const DEFAULT_ORIGINS_FOR_CAI = ['JFK', 'EWR'];

// Background polling pool — refreshes a fixed set of popular world routes so
// the Live Feed + Best Fares Worldwide stay diverse even when the user only
// tracks a couple of routes. Kept small to bound API usage.
const BG_PAIRS: Array<{ origin: string; destination: string }> = [
  { origin: 'JFK', destination: 'LHR' },
  { origin: 'JFK', destination: 'CDG' },
  { origin: 'JFK', destination: 'FCO' },
  { origin: 'JFK', destination: 'BCN' },
  { origin: 'EWR', destination: 'AMS' },
  { origin: 'EWR', destination: 'DXB' },
  { origin: 'JFK', destination: 'IST' },
  { origin: 'JFK', destination: 'ATH' },
  { origin: 'JFK', destination: 'NRT' },
  { origin: 'LAX', destination: 'BKK' },
  { origin: 'LAX', destination: 'LHR' },
  { origin: 'JFK', destination: 'GRU' },
  { origin: 'JFK', destination: 'MEX' },
  { origin: 'JFK', destination: 'LIS' },
  { origin: 'JFK', destination: 'SYD' },
];

type TPLeg = {
  origin: string;
  destination: string;
  price: number;
  airline: string;
  flight_number: string | number;
  departure_at: string;
  transfers: number;
};

export type BestDeal = {
  origin: string;
  destination: string;       // NEW — route now carries its own dest
  outbound_date: string;
  return_date: string;
  outbound_flight_no: string;
  return_flight_no: string;
  outbound_transfers: number;
  return_transfers: number;
  outbound_dow: number;
  outbound_hour: number;
  return_dow: number;
  return_hour: number;
  per_adult_usd: number;
  party_total_usd: number;
  trip_length_days: number;
  provider?: string;
};

function localDayHour(iso: string): { dow: number; hour: number } {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):/);
  if (!m) return { dow: 0, hour: 0 };
  const [, y, mo, d, h] = m;
  const dow = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
  return { dow, hour: Number(h) };
}

function monthString(yearMonth: { year: number; month: number }): string {
  return `${yearMonth.year}-${String(yearMonth.month).padStart(2, '0')}`;
}

function nextMonths(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1 + i;
    out.push(monthString({
      year: y + Math.floor((m - 1) / 12),
      month: ((m - 1) % 12) + 1,
    }));
  }
  return out;
}

async function fetchMonth(origin: string, destination: string, month: string, token: string): Promise<TPLeg[]> {
  const params = new URLSearchParams({
    origin,
    destination,
    departure_at: month,
    unique: 'false',
    sorting: 'price',
    direct: 'false',
    currency: 'usd',
    limit: '100',
    page: '1',
    one_way: 'true',
    token,
  });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${ENDPOINT}?${params}`, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const j = await res.json() as { data?: TPLeg[]; success?: boolean };
    if (j.success === false) return [];
    // Route-agnostic stop filter: nonstop OR one-stop. We no longer constrain
    // nonstop to a specific carrier (that was an EgyptAir-only heuristic).
    return (j.data ?? []).filter(l => l.transfers <= 1);
  } catch {
    return [];
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    for (;;) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export type RefreshOpts = {
  destinations?: string[];                     // dests to refresh; default = user's tracked
  originsByDest?: Record<string, string[]>;    // origin pool per destination
  monthsAhead?: number;
  minTripDays?: number;
  maxTripDays?: number;
  partyAdults?: number;
  partyInfants?: number;
  reprice?: boolean;                           // run provider reprice pass (default false)
};

export type RefreshResult = { destination: string; count: number; error: string | null };

// Refresh one (origin pool, single destination) and replace cache rows for
// THAT destination only.
async function refreshOneDestination(
  destination: string,
  origins: string[],
  opts: Required<Pick<RefreshOpts, 'monthsAhead' | 'minTripDays' | 'maxTripDays' | 'partyAdults' | 'partyInfants' | 'reprice'>>,
  token: string,
): Promise<RefreshResult> {
  try {
    const months = nextMonths(opts.monthsAhead);

    const outboundJobs = origins.flatMap(origin => months.map(month => ({ origin, month })));
    const returnJobs = origins.flatMap(origin => months.map(month => ({ origin, month })));

    const [outboundResults, returnResults] = await Promise.all([
      mapWithConcurrency(outboundJobs, 4, ({ origin, month }) =>
        fetchMonth(origin, destination, month, token).then(legs => ({ origin, legs }))
      ),
      mapWithConcurrency(returnJobs, 4, ({ origin, month }) =>
        fetchMonth(destination, origin, month, token).then(legs => ({ origin, legs }))
      ),
    ]);

    const outboundsByOrigin: Record<string, TPLeg[]> = {};
    for (const { origin, legs } of outboundResults) {
      outboundsByOrigin[origin] = (outboundsByOrigin[origin] ?? []).concat(legs);
    }
    const returnsByOrigin: Record<string, TPLeg[]> = {};
    for (const { origin, legs } of returnResults) {
      returnsByOrigin[origin] = (returnsByOrigin[origin] ?? []).concat(legs);
    }

    const deals: BestDeal[] = [];
    for (const origin of origins) {
      const outs = outboundsByOrigin[origin] ?? [];
      const rets = returnsByOrigin[origin] ?? [];
      for (const o of outs) {
        const od = new Date(o.departure_at);
        for (const r of rets) {
          const rd = new Date(r.departure_at);
          const days = (rd.getTime() - od.getTime()) / 86400000;
          if (days < opts.minTripDays || days > opts.maxTripDays) continue;
          const perAdult = o.price + r.price;
          const partyTotal = perAdult * opts.partyAdults + perAdult * INFANT_FARE_RATIO * opts.partyInfants;
          const outDh = localDayHour(o.departure_at);
          const retDh = localDayHour(r.departure_at);
          deals.push({
            origin,
            destination,
            outbound_date: o.departure_at.slice(0, 10),
            return_date: r.departure_at.slice(0, 10),
            outbound_flight_no: `${o.airline}${o.flight_number}`,
            return_flight_no: `${r.airline}${r.flight_number}`,
            outbound_transfers: o.transfers,
            return_transfers: r.transfers,
            outbound_dow: outDh.dow,
            outbound_hour: outDh.hour,
            return_dow: retDh.dow,
            return_hour: retDh.hour,
            per_adult_usd: perAdult,
            party_total_usd: partyTotal,
            trip_length_days: Math.round(days),
            provider: 'travelpayouts',
          });
        }
      }
    }

    // Per-bucket top-N retention (keeps months filter useful).
    const PER_BUCKET = 25;
    const MAX_TOTAL_PER_DEST = 1500;

    function bucketKey(d: BestDeal): string {
      const outMonth = d.outbound_date.slice(0, 7);
      const retMonth = d.return_date.slice(0, 7);
      const stopBucket = Math.max(d.outbound_transfers, d.return_transfers);
      return `${d.origin}|${outMonth}|${retMonth}|${stopBucket}`;
    }
    function insertTopN(arr: BestDeal[], item: BestDeal, n: number) {
      let idx = arr.findIndex(x => item.per_adult_usd < x.per_adult_usd);
      if (idx === -1) idx = arr.length;
      arr.splice(idx, 0, item);
      if (arr.length > n) arr.length = n;
    }

    const buckets = new Map<string, BestDeal[]>();
    for (const d of deals) {
      const k = bucketKey(d);
      const arr = buckets.get(k) ?? [];
      insertTopN(arr, d, PER_BUCKET);
      buckets.set(k, arr);
    }
    const top: BestDeal[] = Array.from(buckets.values()).flat();
    top.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
    if (top.length > MAX_TOTAL_PER_DEST) top.length = MAX_TOTAL_PER_DEST;

    // Dedup pass.
    const seen = new Set<string>();
    const dedup: BestDeal[] = [];
    for (const d of top) {
      const k = `${d.origin}|${d.destination}|${d.outbound_date}|${d.return_date}|${d.outbound_transfers}`;
      if (seen.has(k)) continue;
      seen.add(k);
      dedup.push(d);
    }

    // Optional provider reprice (off by default to bound API usage across many dests).
    let final = dedup;
    if (opts.reprice && dedup.length > 0) {
      const REPRICE_LIMIT = 100;
      const ids = enabledProviderIds();
      const allowSerp = process.env.BEST_DEALS_ALLOW_SERPAPI === '1';
      const repriceIds = (allowSerp ? ids : ids.filter(id => id !== 'serpapi')) as any[];
      const repriced = await mapWithConcurrency(dedup.slice(0, REPRICE_LIMIT), 6, async (d) => {
        const stopBucket = Math.max(d.outbound_transfers, d.return_transfers);
        const { offers } = repriceIds.length > 0
          ? await searchProviders({
              origin: d.origin, destination: d.destination,
              departDate: d.outbound_date, returnDate: d.return_date,
              adults: opts.partyAdults, infants: opts.partyInfants,
            }, repriceIds)
          : await searchAllProviders({
              origin: d.origin, destination: d.destination,
              departDate: d.outbound_date, returnDate: d.return_date,
              adults: opts.partyAdults, infants: opts.partyInfants,
            });
        const candidate = offers.find(o => Math.max(o.outbound_transfers, o.return_transfers) === stopBucket);
        if (!candidate) return d;
        const outDh = candidate.outbound_depart_iso ? localDayHour(candidate.outbound_depart_iso) : { dow: d.outbound_dow, hour: d.outbound_hour };
        const retDh = candidate.return_depart_iso ? localDayHour(candidate.return_depart_iso) : { dow: d.return_dow, hour: d.return_hour };
        const perAdult = candidate.per_adult_usd;
        const partyTotal = candidate.total_party_usd > 0
          ? candidate.total_party_usd
          : (perAdult * opts.partyAdults + perAdult * INFANT_FARE_RATIO * opts.partyInfants);
        return {
          ...d,
          outbound_flight_no: candidate.outbound_flight_no || d.outbound_flight_no,
          return_flight_no: candidate.return_flight_no || d.return_flight_no,
          outbound_transfers: candidate.outbound_transfers,
          return_transfers: candidate.return_transfers,
          outbound_dow: outDh.dow,
          outbound_hour: outDh.hour,
          return_dow: retDh.dow,
          return_hour: retDh.hour,
          per_adult_usd: perAdult,
          party_total_usd: partyTotal,
          provider: candidate.provider,
        };
      });
      final = [...repriced, ...dedup.slice(REPRICE_LIMIT)];
      final.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
    }

    // Persist — REPLACE only this destination's rows so multi-dest refreshes
    // can run independently (e.g. bg-poll vs best-deals).
    const db = getDb();
    ensureBestDealsSchema(db);
    const tx = db.transaction((rows: BestDeal[]) => {
      db.prepare('DELETE FROM best_deals_cache WHERE destination = ?').run(destination);
      const ins = db.prepare(`INSERT INTO best_deals_cache
        (origin, destination, outbound_date, return_date, outbound_flight_no, return_flight_no,
         outbound_transfers, return_transfers,
         outbound_dow, outbound_hour, return_dow, return_hour,
         per_adult_usd, party_total_usd, trip_length_days, provider, rank)
        VALUES (@origin, @destination, @outbound_date, @return_date, @outbound_flight_no, @return_flight_no,
                @outbound_transfers, @return_transfers,
                @outbound_dow, @outbound_hour, @return_dow, @return_hour,
                @per_adult_usd, @party_total_usd, @trip_length_days, @provider, @rank)`);
      rows.forEach((d, i) => ins.run({ ...d, provider: d.provider ?? 'travelpayouts', rank: i + 1 }));
    });
    tx(final);

    return { destination, count: final.length, error: null };
  } catch (e: any) {
    return { destination, count: 0, error: e?.message ?? String(e) };
  }
}

// Public API: refresh user-tracked destinations.
export async function refreshBestDeals(opts: RefreshOpts = {}): Promise<RefreshResult[]> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) throw new Error('TRAVELPAYOUTS_TOKEN not set');

  const monthsAhead = opts.monthsAhead ?? 12;
  const minTripDays = opts.minTripDays ?? 7;
  const maxTripDays = opts.maxTripDays ?? 62;
  const partyAdults = opts.partyAdults ?? 4;
  const partyInfants = opts.partyInfants ?? 1;
  const reprice = opts.reprice ?? false;

  // Discover destinations + origins from tracked searches if caller didn't supply.
  let destinations = opts.destinations ?? queries.distinctTrackedDestinations();
  if (destinations.length === 0) {
    // Fall back to CAI/JFK/EWR so an empty-DB demo still shows something.
    destinations = [DEFAULT_DESTINATION];
  }
  const tracked = queries.distinctTrackedRoutes();
  const originsByDest: Record<string, string[]> = { ...(opts.originsByDest ?? {}) };
  for (const dest of destinations) {
    if (originsByDest[dest] && originsByDest[dest].length > 0) continue;
    const fromTracked = tracked.filter(t => t.destination === dest).map(t => t.origin);
    originsByDest[dest] = fromTracked.length > 0
      ? Array.from(new Set(fromTracked))
      : (dest === DEFAULT_DESTINATION ? DEFAULT_ORIGINS_FOR_CAI : ['JFK']);
  }

  const results: RefreshResult[] = [];
  for (const destination of destinations) {
    const origins = originsByDest[destination];
    const r = await refreshOneDestination(destination, origins, {
      monthsAhead, minTripDays, maxTripDays, partyAdults, partyInfants, reprice,
    }, token);
    results.push(r);
  }
  return results;
}

// Background-polling fleet (called by the bg-poll systemd timer).
export async function refreshBackgroundDestinations(opts: { monthsAhead?: number } = {}): Promise<RefreshResult[]> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) throw new Error('TRAVELPAYOUTS_TOKEN not set');
  const monthsAhead = opts.monthsAhead ?? 8;

  // Group BG_PAIRS by destination → origin list.
  const grouped = new Map<string, string[]>();
  for (const { origin, destination } of BG_PAIRS) {
    const arr = grouped.get(destination) ?? [];
    if (!arr.includes(origin)) arr.push(origin);
    grouped.set(destination, arr);
  }

  // Avoid clobbering destinations the user is actively tracking — those are
  // owned by the `best-deals` job. Background fleet refreshes the rest.
  const userDests = new Set(queries.distinctTrackedDestinations());

  const results: RefreshResult[] = [];
  for (const [destination, origins] of grouped) {
    if (userDests.has(destination)) {
      results.push({ destination, count: 0, error: 'skipped (user-tracked, owned by best-deals job)' });
      continue;
    }
    const r = await refreshOneDestination(destination, origins, {
      monthsAhead, minTripDays: 7, maxTripDays: 62, partyAdults: 1, partyInfants: 0, reprice: false,
    }, token);
    results.push(r);
  }
  return results;
}

function ensureBestDealsSchema(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS best_deals_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
      origin TEXT NOT NULL,
      destination TEXT NOT NULL DEFAULT 'CAI',
      outbound_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      outbound_flight_no TEXT NOT NULL,
      return_flight_no TEXT NOT NULL,
      outbound_transfers INTEGER NOT NULL DEFAULT 0,
      return_transfers INTEGER NOT NULL DEFAULT 0,
      outbound_dow INTEGER NOT NULL DEFAULT 0,
      outbound_hour INTEGER NOT NULL DEFAULT 0,
      return_dow INTEGER NOT NULL DEFAULT 0,
      return_hour INTEGER NOT NULL DEFAULT 0,
      per_adult_usd REAL NOT NULL,
      party_total_usd REAL NOT NULL,
      trip_length_days INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'travelpayouts',
      rank INTEGER NOT NULL
    );
  `);
  const columns = db.prepare(`PRAGMA table_info(best_deals_cache)`).all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map(c => c.name));
  for (const col of ['outbound_transfers', 'return_transfers', 'outbound_dow', 'outbound_hour', 'return_dow', 'return_hour']) {
    if (!columnNames.has(col)) {
      db.prepare(`ALTER TABLE best_deals_cache ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`).run();
    }
  }
  if (!columnNames.has('provider')) {
    db.prepare(`ALTER TABLE best_deals_cache ADD COLUMN provider TEXT NOT NULL DEFAULT 'travelpayouts'`).run();
  }
  if (!columnNames.has('destination')) {
    db.prepare(`ALTER TABLE best_deals_cache ADD COLUMN destination TEXT NOT NULL DEFAULT 'CAI'`).run();
    try { db.prepare(`CREATE INDEX IF NOT EXISTS idx_best_deals_dest ON best_deals_cache(destination, rank)`).run(); } catch {}
  }
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_best_deals_price_rank ON best_deals_cache(per_adult_usd, rank)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_best_deals_dest_price_rank ON best_deals_cache(destination, per_adult_usd, rank)`).run();
}

export function getCachedBestDeals(limit = 10, destination?: string): { deals: BestDeal[]; refreshed_at: string | null } {
  const db = getDb();
  ensureBestDealsSchema(db);
  const rows = destination
    ? db.prepare(`SELECT * FROM best_deals_cache WHERE destination = ? ORDER BY per_adult_usd ASC, rank LIMIT ?`).all(destination, limit) as Array<BestDeal & { refreshed_at: string }>
    : db.prepare(`SELECT * FROM best_deals_cache ORDER BY per_adult_usd ASC, rank LIMIT ?`).all(limit) as Array<BestDeal & { refreshed_at: string }>;
  return {
    deals: rows.map(({ refreshed_at, ...d }) => ({
      ...d,
      destination: d.destination ?? 'CAI',
      outbound_transfers: d.outbound_transfers ?? 0,
      return_transfers: d.return_transfers ?? 0,
      outbound_dow: d.outbound_dow ?? 0,
      outbound_hour: d.outbound_hour ?? 0,
      return_dow: d.return_dow ?? 0,
      return_hour: d.return_hour ?? 0,
      provider: (d as any).provider ?? 'travelpayouts',
    })),
    refreshed_at: rows[0]?.refreshed_at ?? null,
  };
}

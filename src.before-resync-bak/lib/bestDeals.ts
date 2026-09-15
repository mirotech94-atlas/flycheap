import 'server-only';
import { getDb } from './db';
import { enabledProviderIds, searchAllProviders, searchProviders } from './providers';

// Scan N months ahead for the cheapest EgyptAir nonstop round-trip pairings
// across both JFK and EWR origins. Travelpayouts is unmetered for affiliates,
// so 24-48 calls per refresh is fine.

const ENDPOINT = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const EGYPTAIR_CODE = 'MS';
const DESTINATION = 'CAI';
const ORIGINS = ['JFK', 'EWR'];
const INFANT_FARE_RATIO = 0.1;

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
  outbound_date: string;
  return_date: string;
  outbound_flight_no: string;
  return_flight_no: string;
  outbound_transfers: number;
  return_transfers: number;
  outbound_dow: number;       // 0=Sun, 1=Mon, ..., 6=Sat (local airport time)
  outbound_hour: number;      // 0-23 (local airport time)
  return_dow: number;
  return_hour: number;
  per_adult_usd: number;
  party_total_usd: number;
  trip_length_days: number;
  provider?: string;          // best provider for this exact date pairing
};

// Parse local date/time from an ISO string with offset like "2026-05-12T13:00:00-04:00".
// Returns { dow: 0-6, hour: 0-23 } in the airport's LOCAL time, not UTC.
function localDayHour(iso: string): { dow: number; hour: number } {
  // Strip the timezone offset and parse the YYYY-MM-DDTHH:MM:SS portion as local components.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):/);
  if (!m) return { dow: 0, hour: 0 };
  const [, y, mo, d, h] = m;
  // Compute day-of-week using UTC math on the date portion (no TZ shift involved).
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
    const m = now.getUTCMonth() + 1 + i; // 1-indexed
    out.push(monthString({
      year: y + Math.floor((m - 1) / 12),
      month: ((m - 1) % 12) + 1,
    }));
  }
  return out;
}

async function fetchMonth(origin: string, destination: string, month: string, token: string): Promise<TPLeg[]> {
  // We want to surface:
  // - Nonstop: EgyptAir only (MS), transfers=0
  // - One-stop: ANY airline, transfers=1
  // So we query with direct=false and filter locally.
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
    return (j.data ?? []).filter(l => {
      if (l.transfers === 0) return l.airline === EGYPTAIR_CODE;
      return l.transfers === 1;
    });
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

export async function refreshBestDeals(opts?: { monthsAhead?: number; minTripDays?: number; maxTripDays?: number; partyAdults?: number; partyInfants?: number }): Promise<BestDeal[]> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) throw new Error('TRAVELPAYOUTS_TOKEN not set');

  const monthsAhead = opts?.monthsAhead ?? 12;
  const minTrip = opts?.minTripDays ?? 7;
  const maxTrip = opts?.maxTripDays ?? 62; // 2 months max stay
  const adults = opts?.partyAdults ?? 4;
  const infants = opts?.partyInfants ?? 1;

  const months = nextMonths(monthsAhead);

  // Fetch every (origin, month) and (CAI->origin, month) in parallel.
  const outboundJobs = ORIGINS.flatMap(origin => months.map(month => ({ origin, month })));
  const returnJobs = ORIGINS.flatMap(origin => months.map(month => ({ origin, month })));

  const [outboundResults, returnResults] = await Promise.all([
    mapWithConcurrency(outboundJobs, 4, ({ origin, month }) =>
      fetchMonth(origin, DESTINATION, month, token).then(legs => ({ origin, legs }))
    ),
    mapWithConcurrency(returnJobs, 4, ({ origin, month }) =>
      fetchMonth(DESTINATION, origin, month, token).then(legs => ({ origin, legs }))
    ),
  ]);

  // Group by origin.
  const outboundsByOrigin: Record<string, TPLeg[]> = {};
  for (const { origin, legs } of outboundResults) {
    outboundsByOrigin[origin] = (outboundsByOrigin[origin] ?? []).concat(legs);
  }
  const returnsByOrigin: Record<string, TPLeg[]> = {};
  for (const { origin, legs } of returnResults) {
    returnsByOrigin[origin] = (returnsByOrigin[origin] ?? []).concat(legs);
  }

  // For each origin, pair outbound with return (return strictly after outbound,
  // trip length within bounds), keep cheapest.
  const deals: BestDeal[] = [];
  for (const origin of ORIGINS) {
    const outs = outboundsByOrigin[origin] ?? [];
    const rets = returnsByOrigin[origin] ?? [];
    for (const o of outs) {
      const od = new Date(o.departure_at);
      for (const r of rets) {
        const rd = new Date(r.departure_at);
        const days = (rd.getTime() - od.getTime()) / 86400000;
        if (days < minTrip || days > maxTrip) continue;
        const perAdult = o.price + r.price;
        const partyTotal = perAdult * adults + perAdult * INFANT_FARE_RATIO * infants;
        const outDh = localDayHour(o.departure_at);
        const retDh = localDayHour(r.departure_at);
        deals.push({
          origin,
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
        });
      }
    }
  }

  // Instead of keeping only the global cheapest (which tends to concentrate in a single month),
  // keep the cheapest N per (origin, outbound month, return month, stop bucket). This ensures
  // filters like "leave in July, return in August" still have results even when those months
  // are not among the absolute cheapest.
  const PER_BUCKET = 25;
  const MAX_TOTAL = 5000;

  function bucketKey(d: BestDeal): string {
    const outMonth = d.outbound_date.slice(0, 7);
    const retMonth = d.return_date.slice(0, 7);
    const stopBucket = Math.max(d.outbound_transfers, d.return_transfers); // 0 or 1
    return `${d.origin}|${outMonth}|${retMonth}|${stopBucket}`;
  }

  function insertTopN(arr: BestDeal[], item: BestDeal, n: number) {
    // Keep array sorted ascending by per_adult_usd (tiny N so O(N) insert is fine).
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
  if (top.length > MAX_TOTAL) top.length = MAX_TOTAL;

  // ----------------------------------------------------------------------
  // Free Travelpayouts seed using /get_latest_prices (different cache than
  // /prices_for_dates). Uses the existing TP token, no new credentials needed.
  // Fills in months where the primary cache has 0 results (e.g. Jul/Aug 2026).
  // City code "NYC" covers both JFK and EWR.
  // ----------------------------------------------------------------------
  const TP_LATEST = 'https://api.travelpayouts.com/aviasales/v3/get_latest_prices';

  async function addLatestPricesSeed(monthStart: string) {
    const params = new URLSearchParams({
      origin: 'NYC',
      destination: DESTINATION,
      beginning_of_period: `${monthStart}-01`,
      period_type: 'month',
      one_way: 'false',
      page: '1',
      limit: '100',
      show_to_affiliates: 'true',
      sorting: 'price',
      trip_class: '0',
      currency: 'usd',
      token: token!,
    });
    try {
      const r = await fetch(`${TP_LATEST}?${params}`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json() as { data?: Array<{
        depart_date: string; return_date: string; value: number;
        number_of_changes: number;
      }> };
      const items = (j.data ?? []).filter(x => x.return_date);
      for (const x of items) {
        const depart = x.depart_date.slice(0, 10);
        const ret = x.return_date.slice(0, 10);
        const days = (new Date(ret).getTime() - new Date(depart).getTime()) / 86400000;
        if (days < minTrip || days > maxTrip) continue;
        // The /get_latest endpoint reports the city (NYC), not the airport.
        // We split into two candidates (JFK + EWR) so both filter buckets show data;
        // when the user clicks Book we route them through Aviasales which picks the
        // actual airport at booking time.
        for (const origin of ORIGINS) {
          const perAdult = x.value;
          const partyTotal = perAdult * adults + perAdult * INFANT_FARE_RATIO * infants;
          const outDh = localDayHour(x.depart_date);
          const retDh = localDayHour(x.return_date);
          top.push({
            origin,
            outbound_date: depart,
            return_date: ret,
            outbound_flight_no: '',
            return_flight_no: '',
            outbound_transfers: x.number_of_changes,
            return_transfers: x.number_of_changes,
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
    } catch { /* ignore — keep what we already have */ }
  }

  // Always seed every month from the latest-prices feed. Even when the
  // primary cache has data for a given month, the latest-prices feed often
  // has trips that span INTO adjacent months (e.g. Jul depart → Aug return)
  // that the prices_for_dates endpoint never produces because it pairs only
  // within a single month. The dedup pass below removes overlap.
  for (const m of months) {
    await addLatestPricesSeed(m);
  }
  // De-dupe + re-sort after seeding.
  const seen = new Set<string>();
  const dedup: BestDeal[] = [];
  for (const d of top) {
    const k = `${d.origin}|${d.outbound_date}|${d.return_date}|${d.outbound_transfers}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(d);
  }
  top.length = 0;
  top.push(...dedup);
  top.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
  if (top.length > MAX_TOTAL) top.length = MAX_TOTAL;

  // Supplemental "seed" for July->August windows: Travelpayouts cache is sometimes missing
  // return legs for certain months (e.g., CAI->JFK in Aug). To keep the dashboard filters
  // useful, we add a small set of amadeus-sourced candidates for July outbound / Aug return.
  //
  // This is intentionally small so it won't burn SerpAPI quota; it uses Amadeus only.
  async function addJulyAugSeeds() {
    const alreadyHasJulyAug = top.some(d => d.outbound_date.startsWith('2026-07') && d.return_date.startsWith('2026-08'));
    if (alreadyHasJulyAug) return;
    const depDates = ['2026-07-08', '2026-07-12', '2026-07-16', '2026-07-20', '2026-07-24', '2026-07-28'];
    const retDates = ['2026-08-18', '2026-08-22', '2026-08-24', '2026-08-26', '2026-08-28'];

    const jobs: Array<{ origin: string; depart: string; ret: string }> = [];
    for (const origin of ORIGINS) {
      for (const depart of depDates) for (const ret of retDates) {
        const days = (new Date(ret).getTime() - new Date(depart).getTime()) / 86400000;
        if (days < minTrip || days > maxTrip) continue;
        jobs.push({ origin, depart, ret });
      }
    }
    // Prefer Amadeus (cheaper quota than SerpAPI and more stable). If Amadeus isn't configured,
    // fall back to SerpAPI just for this small July/Aug seed set.
    const providerIds = (process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET)
      ? (['amadeus'] as const)
      : (process.env.SERPAPI_KEY ? (['serpapi'] as const) : ([] as const));

    if (providerIds.length === 0) return;

    const seeded: Array<BestDeal | null> = await mapWithConcurrency(jobs, 2, async (j) => {
      const { offers } = await searchProviders({
        origin: j.origin,
        destination: DESTINATION,
        departDate: j.depart,
        returnDate: j.ret,
        adults,
        infants,
      }, [...providerIds]);
      const offer = offers.find(o => Math.max(o.outbound_transfers, o.return_transfers) <= 1);
      if (!offer) return null;
      const outDh = offer.outbound_depart_iso ? localDayHour(offer.outbound_depart_iso) : localDayHour(`${j.depart}T00:00:00Z`);
      const retDh = offer.return_depart_iso ? localDayHour(offer.return_depart_iso) : localDayHour(`${j.ret}T00:00:00Z`);
      return {
        origin: j.origin,
        outbound_date: j.depart,
        return_date: j.ret,
        outbound_flight_no: offer.outbound_flight_no,
        return_flight_no: offer.return_flight_no,
        outbound_transfers: offer.outbound_transfers,
        return_transfers: offer.return_transfers,
        outbound_dow: outDh.dow,
        outbound_hour: outDh.hour,
        return_dow: retDh.dow,
        return_hour: retDh.hour,
        per_adult_usd: offer.per_adult_usd,
        party_total_usd: offer.total_party_usd,
        trip_length_days: Math.round((new Date(j.ret).getTime() - new Date(j.depart).getTime()) / 86400000),
        provider: String(offer.provider),
      };
    });
    for (const d of seeded) if (d) top.push(d);
    top.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
    if (top.length > MAX_TOTAL) top.length = MAX_TOTAL;
  }

  await addJulyAugSeeds();

  // Optional multi-provider "reprice": once we have a manageable set of candidate deals from
  // Travelpayouts (great for breadth), ask enabled providers for the exact date pairing and
  // replace with the cheapest matching offer (keeps 0-stop as 0-stop, 1-stop as 1-stop).
  //
  // This is what makes the 12-month scan actually benefit from Google Flights, Amadeus, etc.
  const REPRICE_LIMIT = 250; // keep API usage bounded
  async function repriceOne(d: BestDeal): Promise<BestDeal> {
    const stopBucket = Math.max(d.outbound_transfers, d.return_transfers); // 0 or 1
    const ids = enabledProviderIds();
    const allowSerp = process.env.BEST_DEALS_ALLOW_SERPAPI === '1';
    const repriceIds = allowSerp ? ids : ids.filter(id => id !== 'serpapi');
    const { offers } = repriceIds.length > 0
      ? await searchProviders({
          origin: d.origin,
          destination: DESTINATION,
          departDate: d.outbound_date,
          returnDate: d.return_date,
          adults,
          infants,
        }, repriceIds as any)
      : await searchAllProviders({
          origin: d.origin,
          destination: DESTINATION,
          departDate: d.outbound_date,
          returnDate: d.return_date,
          adults,
          infants,
        });
    const candidate = offers.find(o => {
      const maxT = Math.max(o.outbound_transfers, o.return_transfers);
      if (maxT !== stopBucket) return false;
      // Nonstop is EgyptAir only on this route; keep it strict.
      if (stopBucket === 0) return o.airline === EGYPTAIR_CODE;
      return true;
    });
    if (!candidate) return d;
    const outDh = candidate.outbound_depart_iso ? localDayHour(candidate.outbound_depart_iso) : { dow: d.outbound_dow, hour: d.outbound_hour };
    const retDh = candidate.return_depart_iso ? localDayHour(candidate.return_depart_iso) : { dow: d.return_dow, hour: d.return_hour };
    const perAdult = candidate.per_adult_usd;
    const partyTotal = candidate.total_party_usd > 0 ? candidate.total_party_usd : (perAdult * adults + perAdult * INFANT_FARE_RATIO * infants);
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
  }
  const repriced = await mapWithConcurrency(top.slice(0, REPRICE_LIMIT), 6, repriceOne);
  for (let i = 0; i < repriced.length; i++) top[i] = repriced[i];
  top.sort((a, b) => a.per_adult_usd - b.per_adult_usd);

  // Persist (replace cache).
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS best_deals_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
      origin TEXT NOT NULL,
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
  const tx = db.transaction((rows: BestDeal[]) => {
    db.prepare('DELETE FROM best_deals_cache').run();
    const ins = db.prepare(`INSERT INTO best_deals_cache
      (origin, outbound_date, return_date, outbound_flight_no, return_flight_no,
       outbound_transfers, return_transfers,
       outbound_dow, outbound_hour, return_dow, return_hour,
       per_adult_usd, party_total_usd, trip_length_days, provider, rank)
      VALUES (@origin, @outbound_date, @return_date, @outbound_flight_no, @return_flight_no,
              @outbound_transfers, @return_transfers,
              @outbound_dow, @outbound_hour, @return_dow, @return_hour,
              @per_adult_usd, @party_total_usd, @trip_length_days, @provider, @rank)`);
    rows.forEach((d, i) => ins.run({ ...d, provider: d.provider ?? 'travelpayouts', rank: i + 1 }));
  });
  tx(top);

  return top;
}

export function getCachedBestDeals(limit = 10): { deals: BestDeal[]; refreshed_at: string | null } {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS best_deals_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
      origin TEXT NOT NULL,
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
  const rows = db.prepare(
    `SELECT * FROM best_deals_cache ORDER BY rank LIMIT ?`
  ).all(limit) as Array<BestDeal & { refreshed_at: string }>;
  return {
    deals: rows.map(({ refreshed_at, ...d }) => ({
      ...d,
      outbound_transfers: d.outbound_transfers ?? (d.origin === 'EWR' ? 1 : 0),
      return_transfers: d.return_transfers ?? (d.origin === 'EWR' ? 1 : 0),
      outbound_dow: d.outbound_dow ?? 0,
      outbound_hour: d.outbound_hour ?? 0,
      return_dow: d.return_dow ?? 0,
      return_hour: d.return_hour ?? 0,
      provider: (d as any).provider ?? 'travelpayouts',
    })),
    refreshed_at: rows[0]?.refreshed_at ?? null,
  };
}

import 'server-only';
import { queries } from './db';

/**
 * Poll economics — what a single provider call actually costs us.
 *
 * This is the COGS half of the whole business. The spec is explicit that
 * provider pricing must be editable without a deploy ("Write this as a routing
 * table you can edit without a deploy. Provider pricing and quality will change
 * and you do not want that in code."), so the numbers live in the `provider_costs`
 * setting — a JSON object of { providerId: usdPerCall } — and are editable from
 * /admin/settings.
 *
 * Every cost is resolved at WRITE time and frozen onto the api_calls row, so
 * re-pricing a provider next month never rewrites what last month cost.
 */

export type ProviderCostMap = Record<string, number>;

/** Shipped defaults. Only used when the setting row is missing or unparseable. */
const FALLBACK: ProviderCostMap = {
  travelpayouts: 0,
  amadeus: 0,
  serpapi: 0.015,
  searchapi: 0.012,
  duffel: 0,
  kiwi: 0,
};

let cache: { at: number; map: ProviderCostMap } | null = null;
const TTL_MS = 60_000;

export function providerCosts(): ProviderCostMap {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  let map: ProviderCostMap = FALLBACK;
  const raw = queries.getSetting('provider_costs');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const cleaned: ProviderCostMap = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          const n = typeof v === 'number' ? v : parseFloat(String(v));
          if (Number.isFinite(n) && n >= 0) cleaned[k] = n;
        }
        // An empty object is a real answer ("nothing costs anything"), but a
        // malformed one should not silently zero out the cost dashboard.
        if (Object.keys(cleaned).length > 0) map = cleaned;
      }
    } catch {
      console.warn('[providerCost] provider_costs setting is not valid JSON — using shipped defaults');
    }
  }
  cache = { at: Date.now(), map };
  return map;
}

/** USD for one call to `provider`. Unknown providers cost 0 until priced. */
export function costPerCall(provider: string | null | undefined): number {
  if (!provider) return 0;
  return providerCosts()[provider] ?? 0;
}

/** Drop the memoised table — call after writing the setting from admin. */
export function invalidateProviderCostCache(): void {
  cache = null;
}

/**
 * Canonical poll key: two users watching JFK→CAI with overlapping date windows
 * are one poll, not two. Normalising here (rather than at each call site) is
 * what makes poll spend grow sub-linearly with users.
 *
 * The date bucket is the ISO week of departure — wide enough that overlapping
 * windows collapse, narrow enough that a fare quoted for it is still the fare
 * the watcher cares about.
 */
export function routeKey(p: {
  origin: string;
  destination: string;
  departDate: string;
  /** Required for correctness: two trips leaving the same week but returning a
   *  week apart are DIFFERENT trips and must not share a price. Omitting it
   *  collapses them, and the cheaper one's fare would be reported for both. */
  returnDate?: string | null;
  adults?: number;
  infants?: number;
}): string {
  const out = isoWeekBucket(p.departDate);
  const back = p.returnDate ? isoWeekBucket(p.returnDate) : 'ow';
  const pax = `${p.adults ?? 1}a${p.infants ?? 0}i`;
  return `${p.origin.toUpperCase()}-${p.destination.toUpperCase()}-${out}_${back}-${pax}`;
}

/** YYYY-Www for an ISO date. Falls back to the raw string when unparseable. */
export function isoWeekBucket(isoDate: string): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(t)) return isoDate || 'unknown';
  const d = new Date(t);
  // ISO week: Thursday of the current week determines the year.
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day);
  const week = Math.round((d.getTime() - week1Mon.getTime()) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

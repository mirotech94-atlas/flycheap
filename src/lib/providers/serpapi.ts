import 'server-only';
import type { FlightProvider, Offer, ProviderResult, SearchParams } from './types';

// SerpAPI's google_flights engine — official scrape of Google Flights.
// Free tier: 100 searches/month. Sign up: https://serpapi.com
// Env: SERPAPI_KEY
//
// Returns the highest-quality data of all the providers (Google Flights is the
// gold standard) but the quota is small — best used for the most-watched routes,
// not the 12-month opportunity scan.

type SerpFlight = {
  flights: Array<{
    departure_airport: { id: string; time: string };
    arrival_airport:   { id: string; time: string };
    flight_number?: string;
    airline?: string;
  }>;
  layovers?: Array<unknown>;
  total_duration?: number;
  price?: number;             // per-adult USD when currency=USD
  departure_token?: string;
};

type SerpResponse = {
  best_flights?: SerpFlight[];
  other_flights?: SerpFlight[];
  error?: string;
};

function legSummary(legs: SerpFlight): {
  flightNo: string;
  iso: string | null;
  transfers: number;
} {
  const segs = legs.flights ?? [];
  const fst = segs[0];
  const flightNo =
    fst?.flight_number
      ? fst.flight_number
      : (fst?.airline ? String(fst.airline) : '');
  return {
    flightNo,
    iso: fst?.departure_airport.time ?? null,
    // Prefer segment count (more reliable than layovers for round-trips).
    transfers: Math.max(0, segs.length - 1),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export const serpapiProvider: FlightProvider = {
  id: 'serpapi',
  label: 'SerpAPI · Google Flights',
  configHint: 'Free 100/mo. Set SERPAPI_KEY (signup: serpapi.com)',
  isConfigured: () => !!process.env.SERPAPI_KEY,

  async search(p: SearchParams): Promise<ProviderResult> {
    const start = Date.now();
    const key = process.env.SERPAPI_KEY;
    if (!key) return { provider: 'serpapi', ok: false, error: 'SERPAPI_KEY not set', status: 0, ms: 0 };

    // SerpAPI's Google Flights engine is a 2-step flow for round trips:
    // 1) query outbounds (each has a departure_token + round-trip price),
    // 2) query again with departure_token to get the matching return options.
    const baseParams: Record<string, string> = {
      engine: 'google_flights',
      api_key: key,
      departure_id: p.origin,
      arrival_id: p.destination,
      outbound_date: p.departDate,
      return_date: p.returnDate,
      adults: String(p.adults),
      infants_in_seat: '0',
      infants_on_lap: String(p.infants),
      currency: 'USD',
      hl: 'en',
      type: '1',                 // 1 = round trip
      // Don't force nonstop-only here. The app's dashboard filters can
      // slice nonstop vs 1-stop vs 2+ across providers.
      stops: '0',                // 0 = any (per SerpAPI docs)
    };

    const res = await fetch(`https://serpapi.com/search?${new URLSearchParams(baseParams)}`, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
    const text = await res.text();
    if (!res.ok) {
      const ms = Date.now() - start;
      return { provider: 'serpapi', ok: false, error: `${res.status} ${text.slice(0, 200)}`, status: res.status, ms };
    }

    const j = JSON.parse(text) as SerpResponse;
    if (j.error) {
      const ms = Date.now() - start;
      return { provider: 'serpapi', ok: false, error: j.error, status: 200, ms };
    }

    const all = [...(j.best_flights ?? []), ...(j.other_flights ?? [])];
    const outbounds = all
      .filter(it => typeof it.price === 'number' && !!it.departure_token)
      .slice(0, 12); // protect SerpAPI quota

    async function fetchReturns(token: string): Promise<SerpFlight[]> {
      const r2 = await fetch(`https://serpapi.com/search?${new URLSearchParams({ ...baseParams, departure_token: token })}`, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
      if (!r2.ok) return [];
      const j2 = await r2.json().catch(() => ({} as SerpResponse));
      const list = [
        ...(((j2 as SerpResponse).best_flights ?? []) as SerpFlight[]),
        ...(((j2 as SerpResponse).other_flights ?? []) as SerpFlight[]),
      ];
      return list.filter(it => typeof it.price === 'number');
    }

    const paired = await mapWithConcurrency(outbounds, 3, async (o) => {
      const token = o.departure_token!;
      const returns = await fetchReturns(token);
      const ret = returns[0]; // cheapest matching return for this outbound
      return { out: o, ret };
    });

    const offers: Offer[] = paired
      .filter(p => !!p.ret && typeof p.out.price === 'number' && typeof p.ret?.price === 'number')
      .map(({ out, ret }) => {
        const o = legSummary(out);
        const r = legSummary(ret!);
        const perAdult = out.price ?? 0;
        const totalParty = perAdult * p.adults + perAdult * 0.10 * p.infants;
        return {
          provider: 'serpapi' as const,
          per_adult_usd: perAdult,
          total_party_usd: totalParty,
          outbound_flight_no: o.flightNo,
          return_flight_no: r.flightNo,
          outbound_depart_iso: o.iso,
          return_depart_iso: r.iso,
          outbound_transfers: o.transfers,
          return_transfers: r.transfers,
          airline: out.flights?.[0]?.airline ?? '—',
          raw: { outbound: out, return: ret },
        };
      });

    offers.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
    const ms = Date.now() - start;
    return { provider: 'serpapi', ok: true, offers: offers.slice(0, 25), status: 200, ms };
  },
};

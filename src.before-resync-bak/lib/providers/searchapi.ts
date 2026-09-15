import 'server-only';
import type { FlightProvider, Offer, ProviderResult, SearchParams } from './types';

// SearchAPI.io Google Flights API (scrape).
// Docs: https://www.searchapi.io/docs/google-flights-api
// Env: SEARCHAPI_KEY
//
// This is an optional second Google Flights source (in addition to SerpAPI),
// useful when one provider is quota-limited.

type SAFlight = {
  segments?: Array<{
    flight_number?: string;
    airline_code?: string;
    departure_time?: string; // ISO
  }>;
  total_price?: number;
  currency?: string;
  stops?: number;
};

type SAResponse = {
  best_flights?: SAFlight[];
  other_flights?: SAFlight[];
  error?: string;
  message?: string;
};

function firstSeg(it: SAFlight) {
  return (it.segments ?? [])[0];
}

export const searchapiProvider: FlightProvider = {
  id: 'searchapi',
  label: 'SearchAPI.io · Google Flights',
  configHint: 'Set SEARCHAPI_KEY (SearchAPI.io Google Flights API key)',
  isConfigured: () => !!process.env.SEARCHAPI_KEY,

  async search(p: SearchParams): Promise<ProviderResult> {
    const start = Date.now();
    const key = process.env.SEARCHAPI_KEY;
    if (!key) return { provider: 'searchapi', ok: false, error: 'SEARCHAPI_KEY not set', status: 0, ms: 0 };

    const params = new URLSearchParams({
      api_key: key,
      departure_id: p.origin,
      arrival_id: p.destination,
      outbound_date: p.departDate,
      return_date: p.returnDate,
      flight_type: 'round_trip',
      currency: 'USD',
      hl: 'en',
      adults: String(p.adults),
      infants: String(p.infants),
    });

    const res = await fetch(`https://www.searchapi.io/api/v1/search?engine=google_flights&${params}`, { cache: 'no-store' });
    const ms = Date.now() - start;
    const text = await res.text();
    if (!res.ok) return { provider: 'searchapi', ok: false, error: `${res.status} ${text.slice(0, 200)}`, status: res.status, ms };

    const j = JSON.parse(text) as SAResponse;
    if (j.error || j.message) return { provider: 'searchapi', ok: false, error: j.message || j.error || 'error', status: 200, ms };

    const all = [...(j.best_flights ?? []), ...(j.other_flights ?? [])]
      .filter(it => typeof it.total_price === 'number');

    const offers: Offer[] = all.map(it => {
      const fst = firstSeg(it);
      const price = it.total_price ?? 0;
      const total = price; // SearchAPI generally returns total trip price; treat as per-adult for now.
      const perAdult = total;
      const stops = typeof it.stops === 'number' ? it.stops : 0;
      return {
        provider: 'searchapi' as const,
        per_adult_usd: perAdult,
        total_party_usd: perAdult * p.adults + perAdult * 0.10 * p.infants,
        outbound_flight_no: fst?.flight_number ?? '',
        return_flight_no: '',
        outbound_depart_iso: fst?.departure_time ?? null,
        return_depart_iso: null,
        outbound_transfers: stops,
        return_transfers: stops,
        airline: fst?.airline_code ?? '',
        raw: it,
      };
    }).filter(o => !!o.outbound_flight_no);

    offers.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
    return { provider: 'searchapi', ok: true, offers: offers.slice(0, 25), status: 200, ms };
  },
};


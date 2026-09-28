import 'server-only';
import type { FlightProvider, Offer, ProviderResult, SearchParams } from './types';

// Kiwi Tequila API (Kiwi.com affiliate program).
// Docs: https://tequila-api.kiwi.com
// Env: KIWI_TEQUILA_KEY
//
// Notes:
// - Date format is dd/mm/YYYY.
// - Supports round trip itineraries with connections (one-stop, two-stop, etc).

type KiwiRouteSeg = {
  return: 0 | 1;
  airline: string;
  flight_no: number;
  local_departure: string; // ISO with offset
};

type KiwiItin = {
  price: number; // total price in requested currency for all passengers
  route: KiwiRouteSeg[];
};

type KiwiResponse = {
  data?: KiwiItin[];
  error?: string;
  message?: string;
};

function ddmmyyyy(iso: string): string {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function segsFor(it: KiwiItin, leg: 0 | 1): KiwiRouteSeg[] {
  return (it.route ?? []).filter(s => s.return === leg);
}

export const kiwiProvider: FlightProvider = {
  id: 'kiwi',
  label: 'Kiwi (Tequila API)',
  configHint: 'Set KIWI_TEQUILA_KEY (Kiwi Tequila API key)',
  isConfigured: () => !!process.env.KIWI_TEQUILA_KEY,

  async search(p: SearchParams): Promise<ProviderResult> {
    const start = Date.now();
    const key = process.env.KIWI_TEQUILA_KEY;
    if (!key) return { provider: 'kiwi', ok: false, error: 'KIWI_TEQUILA_KEY not set', status: 0, ms: 0 };

    const params = new URLSearchParams({
      fly_from: p.origin,
      fly_to: p.destination,
      date_from: ddmmyyyy(p.departDate),
      date_to: ddmmyyyy(p.departDate),
      return_from: ddmmyyyy(p.returnDate),
      return_to: ddmmyyyy(p.returnDate),
      flight_type: 'round',
      adults: String(p.adults),
      infants: String(p.infants),
      curr: 'USD',
      sort: 'price',
      one_for_city: '1',
      limit: '50',
      // Keep results reasonably relevant; dashboard filters can still slice stops.
      max_stopovers: '2',
      partner_market: 'us',
      locale: 'en',
    });

    const res = await fetch(`https://tequila-api.kiwi.com/v2/search?${params}`, {
      signal: AbortSignal.timeout(60_000),
      headers: { apikey: key },
      cache: 'no-store',
    });
    const ms = Date.now() - start;
    const text = await res.text();
    if (!res.ok) return { provider: 'kiwi', ok: false, error: `${res.status} ${text.slice(0, 200)}`, status: res.status, ms };

    const j = JSON.parse(text) as KiwiResponse;
    if (j.error || j.message) return { provider: 'kiwi', ok: false, error: j.message || j.error || 'error', status: 200, ms };
    const list = (j.data ?? []) as KiwiItin[];

    const offers: Offer[] = list.map(it => {
      const out = segsFor(it, 0);
      const ret = segsFor(it, 1);
      const fst = out[0];
      const rfs = ret[0];
      const total = typeof it.price === 'number' ? it.price : 0;
      // Tequila price is total for requested passenger mix. Derive a per-adult-ish metric
      // so we can sort consistently with other providers.
      const perAdult = total / Math.max(1, p.adults + p.infants * 0.1);
      return {
        provider: 'kiwi' as const,
        per_adult_usd: perAdult,
        total_party_usd: total,
        outbound_flight_no: fst ? `${fst.airline}${fst.flight_no}` : '',
        return_flight_no: rfs ? `${rfs.airline}${rfs.flight_no}` : '',
        outbound_depart_iso: fst?.local_departure ?? null,
        return_depart_iso: rfs?.local_departure ?? null,
        outbound_transfers: Math.max(0, out.length - 1),
        return_transfers: Math.max(0, ret.length - 1),
        airline: fst?.airline ?? '',
        raw: it,
      };
    }).filter(o => !!o.outbound_flight_no);

    offers.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
    return { provider: 'kiwi', ok: true, offers: offers.slice(0, 25), status: 200, ms };
  },
};


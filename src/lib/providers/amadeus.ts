import 'server-only';
import type { FlightProvider, Offer, ProviderResult, SearchParams } from './types';

// Amadeus Self-Service "Flight Offers Search" v2.
// Free tier: 2,000 calls/month. Sign up: https://developers.amadeus.com
// Env: AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET (test environment by default;
// set AMADEUS_BASE=https://api.amadeus.com for production credentials).
//
// Returns real GDS data — same source travel agents use. Higher quality than
// the Travelpayouts cache, but limited to 2k requests/month.

type Token = { access_token: string; expires_at: number };
let cachedToken: Token | null = null;

function baseUrl(): string {
  return process.env.AMADEUS_BASE || 'https://test.api.amadeus.com';
}

async function getToken(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (cachedToken && cachedToken.expires_at > Date.now() + 30_000) {
    return { ok: true, token: cachedToken.access_token };
  }
  const id = process.env.AMADEUS_CLIENT_ID;
  const secret = process.env.AMADEUS_CLIENT_SECRET;
  if (!id || !secret) return { ok: false, error: 'AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET not set' };

  const res = await fetch(`${baseUrl()}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}`,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) return { ok: false, error: j.error_description || `auth ${res.status}` };
  cachedToken = { access_token: j.access_token, expires_at: Date.now() + (j.expires_in ?? 1800) * 1000 };
  return { ok: true, token: j.access_token };
}

type AmadeusOffer = {
  price: { total: string; grandTotal?: string; currency: string };
  itineraries: Array<{
    segments: Array<{
      carrierCode: string;
      number: string;
      departure: { iataCode: string; at: string };
      arrival:   { iataCode: string; at: string };
    }>;
  }>;
  validatingAirlineCodes: string[];
};

export const amadeusProvider: FlightProvider = {
  id: 'amadeus',
  label: 'Amadeus Self-Service',
  configHint: 'Free 2k/mo. Set AMADEUS_CLIENT_ID + AMADEUS_CLIENT_SECRET (signup: developers.amadeus.com)',
  isConfigured: () => !!(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET),

  async search(p: SearchParams): Promise<ProviderResult> {
    const start = Date.now();
    const auth = await getToken();
    if (!auth.ok) return { provider: 'amadeus', ok: false, error: auth.error, status: 0, ms: Date.now() - start };

    const params = new URLSearchParams({
      originLocationCode: p.origin,
      destinationLocationCode: p.destination,
      departureDate: p.departDate,
      returnDate: p.returnDate,
      adults: String(p.adults),
      currencyCode: 'USD',
      max: '20',
      // Don't force airline or nonstop here. Direct-only vs one-stop filtering
      // is handled at the dashboard layer via the Stops filter.
    });
    if (p.infants > 0) params.set('infants', String(p.infants));

    const res = await fetch(`${baseUrl()}/v2/shopping/flight-offers?${params}`, {
      headers: { Authorization: `Bearer ${auth.token}` }, cache: 'no-store',
    });
    const ms = Date.now() - start;
    const text = await res.text();
    if (!res.ok) return { provider: 'amadeus', ok: false, error: `${res.status} ${text.slice(0, 200)}`, status: res.status, ms };
    const j = JSON.parse(text) as { data?: AmadeusOffer[] };
    const list = j.data ?? [];

    const offers: Offer[] = list.map(a => {
      const out = a.itineraries[0]?.segments ?? [];
      const ret = a.itineraries[1]?.segments ?? [];
      const perPartyTotal = parseFloat(a.price.grandTotal ?? a.price.total);
      const perAdult = perPartyTotal / Math.max(1, p.adults + p.infants * 0.1);
      const fst = out[0], lst = out[out.length - 1];
      const rfs = ret[0], rls = ret[ret.length - 1];
      return {
        provider: 'amadeus' as const,
        per_adult_usd: perAdult,
        total_party_usd: perPartyTotal,
        outbound_flight_no: fst ? `${fst.carrierCode}${fst.number}` : '',
        return_flight_no:   rfs ? `${rfs.carrierCode}${rfs.number}` : '',
        outbound_depart_iso: fst?.departure.at ?? null,
        return_depart_iso:   rfs?.departure.at ?? null,
        outbound_transfers: Math.max(0, out.length - 1),
        return_transfers:   Math.max(0, ret.length - 1),
        airline: a.validatingAirlineCodes?.[0] ?? fst?.carrierCode ?? 'MS',
        raw: a,
      };
    }).filter(o => o.outbound_flight_no);

    offers.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
    return { provider: 'amadeus', ok: true, offers: offers.slice(0, 25), status: 200, ms };
  },
};

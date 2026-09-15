import 'server-only';
import type { FlightProvider, Offer, ProviderResult, SearchParams } from './types';

// Duffel — modern flight booking API. Free sandbox for development; live data
// requires business verification + payment terms (skip unless you actually plan to book through them).
// Env: DUFFEL_TOKEN
//
// We default to the test environment; set DUFFEL_BASE=https://api.duffel.com for live.

type DuffelOffer = {
  total_amount: string;
  total_currency: string;
  slices: Array<{
    segments: Array<{
      operating_carrier: { iata_code: string };
      operating_carrier_flight_number: string;
      departing_at: string;
      origin: { iata_code: string };
      destination: { iata_code: string };
    }>;
  }>;
};

export const duffelProvider: FlightProvider = {
  id: 'duffel',
  label: 'Duffel (sandbox)',
  configHint: 'Sandbox is free; live data needs business verification. Set DUFFEL_TOKEN.',
  isConfigured: () => !!process.env.DUFFEL_TOKEN,

  async search(p: SearchParams): Promise<ProviderResult> {
    const start = Date.now();
    const token = process.env.DUFFEL_TOKEN;
    if (!token) return { provider: 'duffel', ok: false, error: 'DUFFEL_TOKEN not set', status: 0, ms: 0 };

    const base = process.env.DUFFEL_BASE || 'https://api.duffel.com';
    const reqRes = await fetch(`${base}/air/offer_requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Duffel-Version': 'v2',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        data: {
          slices: [
            { origin: p.origin,      destination: p.destination, departure_date: p.departDate },
            { origin: p.destination, destination: p.origin,      departure_date: p.returnDate },
          ],
          passengers: [
            ...Array.from({ length: p.adults  }, () => ({ type: 'adult' })),
            ...Array.from({ length: p.infants }, () => ({ type: 'infant_without_seat' })),
          ],
          cabin_class: 'economy',
        },
      }),
    });
    const ms = Date.now() - start;
    const reqText = await reqRes.text();
    if (!reqRes.ok) return { provider: 'duffel', ok: false, error: `${reqRes.status} ${reqText.slice(0, 200)}`, status: reqRes.status, ms };

    const reqJ = JSON.parse(reqText) as { data?: { offers?: DuffelOffer[] } };
    const list = reqJ.data?.offers ?? [];

    const offers: Offer[] = list.map(o => {
      const out = o.slices[0]?.segments ?? [];
      const ret = o.slices[1]?.segments ?? [];
      const total = parseFloat(o.total_amount);
      const perAdult = total / Math.max(1, p.adults + p.infants * 0.1);
      const fst = out[0], rfs = ret[0];
      return {
        provider: 'duffel' as const,
        per_adult_usd: o.total_currency === 'USD' ? perAdult : perAdult,
        total_party_usd: total,
        outbound_flight_no: fst ? `${fst.operating_carrier.iata_code}${fst.operating_carrier_flight_number}` : '',
        return_flight_no:   rfs ? `${rfs.operating_carrier.iata_code}${rfs.operating_carrier_flight_number}` : '',
        outbound_depart_iso: fst?.departing_at ?? null,
        return_depart_iso:   rfs?.departing_at ?? null,
        outbound_transfers: Math.max(0, out.length - 1),
        return_transfers:   Math.max(0, ret.length - 1),
        airline: fst?.operating_carrier.iata_code ?? 'MS',
        raw: o,
      };
    }).filter(o => o.airline === 'MS');

    offers.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
    return { provider: 'duffel', ok: true, offers: offers.slice(0, 25), status: 200, ms };
  },
};

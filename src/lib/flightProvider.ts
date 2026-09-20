import 'server-only';
import { searchAllProviders, type PollContext } from './providers';
import type { Offer, SearchParams } from './providers/types';

const INFANT_FARE_RATIO = 0.1;

// Back-compat shape for existing callers that destructure { outbound, inbound, totalPerAdult }.
// New code should use `searchAllProviders` directly and consume `Offer` instead.
export type FlightOffer = Offer & {
  // Aliases that older code reads.
  totalPerAdult: number;
  outbound: { airline: string; flight_number: string; departure_at: string; transfers: number };
  inbound:  { airline: string; flight_number: string; departure_at: string; transfers: number };
};

export type FlightSearchResult =
  | { ok: true; offers: FlightOffer[]; status: number; ms: number }
  | { ok: false; error: string; status: number; ms: number };

export type { SearchParams, PollContext };

function adapt(o: Offer): FlightOffer {
  const splitFlightNo = (s: string) => {
    const m = s.match(/^([A-Z]{2})(\d+)/);
    return m ? { airline: m[1], number: m[2] } : { airline: 'MS', number: s };
  };
  const out = splitFlightNo(o.outbound_flight_no);
  const inb = splitFlightNo(o.return_flight_no);
  return {
    ...o,
    totalPerAdult: o.per_adult_usd,
    outbound: {
      airline: out.airline, flight_number: out.number,
      departure_at: o.outbound_depart_iso ?? '',
      transfers: o.outbound_transfers,
    },
    inbound: {
      airline: inb.airline, flight_number: inb.number,
      departure_at: o.return_depart_iso ?? '',
      transfers: o.return_transfers,
    },
  };
}

export async function searchFlights(p: SearchParams, ctx?: PollContext): Promise<FlightSearchResult> {
  const start = Date.now();
  const { offers, results } = await searchAllProviders(p, ctx);
  const ms = Date.now() - start;
  if (offers.length === 0) {
    const errs = results.filter(r => !r.ok).map(r => `${r.provider}: ${('error' in r ? r.error : '')}`).join(' | ');
    return { ok: true, offers: [], status: 200, ms };
  }
  return { ok: true, offers: offers.slice(0, 25).map(adapt), status: 200, ms };
}

export function pickCheapest(offers: FlightOffer[]): FlightOffer | null {
  return offers[0] ?? null;
}

export function summarizeOffer(offer: FlightOffer, adults: number, infants: number) {
  const perAdult = offer.per_adult_usd;
  const adultsCost = perAdult * adults;
  const infantsCost = perAdult * INFANT_FARE_RATIO * infants;
  const total = offer.total_party_usd > 0 ? offer.total_party_usd : adultsCost + infantsCost;

  return {
    total_price_usd: total,
    base_price_usd: total,
    taxes_fees_usd: 0,
    price_per_adult_usd: perAdult,
    outbound_flight_no: offer.outbound_flight_no,
    return_flight_no:   offer.return_flight_no,
    outbound_depart_iso: offer.outbound_depart_iso,
    return_depart_iso:   offer.return_depart_iso,
    provider: offer.provider,
  };
}

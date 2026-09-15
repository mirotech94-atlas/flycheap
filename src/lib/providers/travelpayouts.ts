import 'server-only';
import type { FlightProvider, Offer, ProviderResult, SearchParams, StopsPref } from './types';

const ENDPOINT = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const LATEST_ENDPOINT = 'https://api.travelpayouts.com/aviasales/v3/get_latest_prices';
const CITY_FOR_AIRPORT: Record<string, string> = {
  JFK: 'NYC', EWR: 'NYC', LGA: 'NYC',
};
const EGYPTAIR = 'MS';

type TPLeg = {
  origin: string; destination: string;
  price: number; airline: string; flight_number: string | number;
  departure_at: string; transfers: number;
};

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime()) / 86400000);
}

/** Allowed transfer counts on each leg given the user's stops preference. */
function transfersAllowed(stops: StopsPref | undefined): (n: number) => boolean {
  switch (stops) {
    case 'nonstop':  return n => n === 0;
    case 'one-stop': return n => n <= 1;       // include nonstop too — TP often misclassifies
    case 'two-plus': return n => n >= 2;
    case 'all':
    default:         return _ => true;
  }
}

async function fetchOneWayMonth(
  origin: string, destination: string, date: string, token: string,
  stops: StopsPref | undefined,
  airline: string | null,
) {
  const month = date.slice(0, 7);
  // Only ask the API to pre-filter when we want strictly nonstop; otherwise pull
  // everything and let the post-filter decide. TP's `direct=true` is exclusive.
  const direct = stops === 'nonstop' ? 'true' : 'false';
  const params = new URLSearchParams({
    origin, destination, departure_at: month,
    unique: 'false', sorting: 'price', direct,
    currency: 'usd', limit: '1000', page: '1', one_way: 'true', token,
  });
  const url = `${ENDPOINT}?${params}`;
  const res = await fetch(url, { cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) return { ok: false as const, error: `${res.status} ${text.slice(0, 200)}`, status: res.status, totalPulled: 0 };
  const j = JSON.parse(text) as { success?: boolean; data?: TPLeg[]; error?: string };
  if (j.success === false) return { ok: false as const, error: j.error || 'success=false', status: res.status, totalPulled: 0 };
  const all = j.data ?? [];
  const allow = transfersAllowed(stops);
  const legs = all.filter(l => allow(l.transfers) && (airline ? l.airline === airline : true));
  return { ok: true as const, legs, status: res.status, totalPulled: all.length, all };
}

export const travelpayoutsProvider: FlightProvider = {
  id: 'travelpayouts',
  label: 'Travelpayouts (Aviasales)',
  configHint: 'Set TRAVELPAYOUTS_TOKEN in .env.local',
  isConfigured: () => !!process.env.TRAVELPAYOUTS_TOKEN,

  async search(p: SearchParams): Promise<ProviderResult> {
    const start = Date.now();
    const token = process.env.TRAVELPAYOUTS_TOKEN;
    if (!token) return { provider: 'travelpayouts', ok: false, error: 'TRAVELPAYOUTS_TOKEN not set', status: 0, ms: 0 };

    // Pull both legs at once. We constrain to the user-supplied month, but the
    // API returns the whole month so we then keep only entries on the exact day.
    // airline === null  → any airline; airline === '' → any airline; airline === 'MS' → EgyptAir-only.
    const airlineFilter: string | null = p.airline === null || p.airline === '' || p.airline === undefined
      ? 'MS'   // default for this app — EgyptAir
      : p.airline === 'ANY' ? null : p.airline;
    const [out, ret] = await Promise.all([
      fetchOneWayMonth(p.origin, p.destination, p.departDate, token, p.stops, airlineFilter),
      fetchOneWayMonth(p.destination, p.origin, p.returnDate, token, p.stops, airlineFilter),
    ]);
    const ms = Date.now() - start;
    if (!out.ok) return { provider: 'travelpayouts', ok: false, error: `outbound: ${out.error}`, status: out.status, ms };
    if (!ret.ok) return { provider: 'travelpayouts', ok: false, error: `inbound: ${ret.error}`,  status: ret.status, ms };

    // Constrain to the exact requested days (the month-wide call returns every
    // day in the month). Comparing the YYYY-MM-DD prefix lets us also accept
    // legs whose API ISO carries a timezone offset.
    const outLegs = out.legs.filter(l => l.departure_at.slice(0, 10) === p.departDate);
    const retLegs = ret.legs.filter(l => l.departure_at.slice(0, 10) === p.returnDate);

    const offers: Offer[] = [];
    for (const o of outLegs) for (const i of retLegs) {
      if (i.departure_at <= o.departure_at) continue;
      const perAdult = o.price + i.price;
      const total = perAdult * p.adults + perAdult * 0.10 * p.infants;
      offers.push({
        provider: 'travelpayouts',
        per_adult_usd: perAdult, total_party_usd: total,
        // Some Travelpayouts sources omit the flight number; keep the carrier code so the UI can still show the airline.
        outbound_flight_no: o.flight_number ? `${o.airline}${o.flight_number}` : (o.airline || ''),
        return_flight_no:   i.flight_number ? `${i.airline}${i.flight_number}` : (i.airline || ''),
        outbound_depart_iso: o.departure_at, return_depart_iso: i.departure_at,
        outbound_transfers: o.transfers, return_transfers: i.transfers,
        airline: o.airline, raw: { outbound: o, inbound: i },
      });
    }
    offers.sort((a, b) => a.per_adult_usd - b.per_adult_usd);

    // If we got 0 offers despite the API returning data, surface a useful diagnostic
    // so the UI can show "API returned X candidates for that month, none matched the
    // exact dates / stops you picked".
    // ----- Fallback to /get_latest_prices when /prices_for_dates is empty -----
    // Same TP token, completely different cache sourced from recent OTA searches
    // ("Farehutz", "Cheapfaremart" gates). Often has real round-trip pairings
    // for far-future dates that prices_for_dates misses entirely.
    if (offers.length === 0) {
      const cityO = CITY_FOR_AIRPORT[p.origin] || p.origin;
      const cityD = CITY_FOR_AIRPORT[p.destination] || p.destination;
      const monthStart = `${p.departDate.slice(0, 7)}-01`;
      const params = new URLSearchParams({
        origin: cityO, destination: cityD,
        beginning_of_period: monthStart, period_type: 'month',
        one_way: 'false', page: '1', limit: '100',
        show_to_affiliates: 'true', sorting: 'price',
        trip_class: '0', currency: 'usd', token,
      });
      try {
        const res2 = await fetch(`${LATEST_ENDPOINT}?${params}`, { cache: 'no-store' });
        const txt2 = await res2.text();
        if (res2.ok) {
          const j2 = JSON.parse(txt2) as { data?: Array<{
            depart_date: string; return_date: string; value: number;
            number_of_changes: number; gate: string; origin: string; destination: string;
          }> };
          const items = (j2.data ?? []).filter(x => x.return_date);
          // The /get_latest_prices feed is sparse — exact-day matches are rare.
          // Rank by total day-shift and take the closest 8 pairings within a
          // generous 30-day total window so the user always gets real options.
          const ranked = items
            .filter(x => transfersAllowed(p.stops)(x.number_of_changes))
            .map(x => ({
              ...x,
              dShift: daysBetween(x.depart_date.slice(0, 10), p.departDate),
              rShift: daysBetween(x.return_date.slice(0, 10), p.returnDate),
            }))
            .filter(x => Math.abs(x.dShift) + Math.abs(x.rShift) <= 30)
            .sort((a, b) => (Math.abs(a.dShift) + Math.abs(a.rShift)) - (Math.abs(b.dShift) + Math.abs(b.rShift)))
            .slice(0, 8);
          for (const x of ranked) {
            const perAdult = x.value;
            const total = perAdult * p.adults + perAdult * 0.10 * p.infants;
            // This feed has no flight numbers; it sometimes carries the carrier code — keep it so the UI can name the airline.
            const carrier = String((x as { airline?: string }).airline ?? '').toUpperCase();
            offers.push({
              provider: 'travelpayouts',
              per_adult_usd: perAdult, total_party_usd: total,
              outbound_flight_no: carrier, return_flight_no: carrier,
              outbound_depart_iso: x.depart_date, return_depart_iso: x.return_date,
              outbound_transfers: x.number_of_changes, return_transfers: x.number_of_changes,
              airline: carrier, // flight numbers are not supplied by this endpoint
              raw: { source: 'get_latest_prices', ...x },
            });
          }
          offers.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
        }
      } catch { /* ignore — surface the original empty result */ }
    }

    if (offers.length === 0) {
      // Build a precise diagnostic so the user can see what TP did/didn't have.
      const outAirlinesSeen = Array.from(new Set(out.all.map(l => l.airline))).sort();
      const retAirlinesSeen = Array.from(new Set(ret.all.map(l => l.airline))).sort();
      const wantedTag = airlineFilter ? `airline=${airlineFilter}` : 'any airline';
      const reason = `Travelpayouts cache for ${p.departDate.slice(0,7)}: ${out.totalPulled} ${p.origin}→${p.destination} candidates [${outAirlinesSeen.join(',') || 'none'}], ${ret.totalPulled} ${p.destination}→${p.origin} candidates [${retAirlinesSeen.join(',') || 'none'}]. After filter (${wantedTag}, stops=${p.stops ?? 'all'}, exact day): out=${outLegs.length}, ret=${retLegs.length}. ${airlineFilter === 'MS' && (out.totalPulled > 0 || ret.totalPulled > 0) && outAirlinesSeen.indexOf('MS') < 0 && retAirlinesSeen.indexOf('MS') < 0 ? '⚠️ No EgyptAir cached for this month — try untoggling "EgyptAir only" or pick a closer month.' : ''}`;
      return { provider: 'travelpayouts', ok: true, offers: [], status: 200, ms, note: reason };
    }

    return { provider: 'travelpayouts', ok: true, offers: offers.slice(0, 50), status: 200, ms };
  },
};

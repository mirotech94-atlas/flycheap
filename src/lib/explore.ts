import 'server-only';

// Worldwide flight discovery using Travelpayouts free endpoints (existing token).
// Powers the "Explore" page — top destinations from a city, hot deals worldwide,
// cheapest months for a chosen route. No new credentials needed.

const HOST = 'https://api.travelpayouts.com';

export type CityDirection = {
  destination: string;
  price: number;
  airline: string | null;
  departure_at: string;
  return_at: string | null;
  flight_number: string | null;
  transfers: number | null;
};

export type LatestDeal = {
  origin: string;
  destination: string;
  price: number;
  depart_date: string;
  return_date: string | null;
  number_of_changes: number;
  found_at: string;
  trip_class: number;
};

function token(): string {
  return process.env.TRAVELPAYOUTS_TOKEN ?? '';
}

/**
 * Top cheap destinations from a given origin city (IATA city code, e.g. NYC, LON).
 * Returns up to ~30 destinations sorted by price asc.
 */
export async function topDestinations(origin: string, currency = 'usd'): Promise<CityDirection[]> {
  const t = token();
  if (!t) return [];
  const params = new URLSearchParams({ origin, currency, token: t });
  const r = await fetch(`${HOST}/v1/city-directions?${params}`, { cache: 'no-store' });
  if (!r.ok) return [];
  const j = await r.json() as { data?: Record<string, {
    price: number; airline: string; departure_at: string; return_at?: string;
    flight_number?: string; transfers?: number;
  }> };
  const data = j.data ?? {};
  return Object.entries(data).map(([dest, v]) => ({
    destination: dest,
    price: v.price,
    airline: v.airline ?? null,
    departure_at: v.departure_at,
    return_at: v.return_at ?? null,
    flight_number: v.flight_number ?? null,
    transfers: v.transfers ?? null,
  })).sort((a, b) => a.price - b.price);
}

/**
 * "Hot deals right now" — recent cheap flights anywhere (or from a given origin).
 * Optionally constrained to a single destination or a max price.
 */
export async function hotDeals(opts: {
  origin?: string; destination?: string; maxPrice?: number;
  oneWay?: boolean; periodType?: 'year' | 'month' | 'day';
  limit?: number;
} = {}): Promise<LatestDeal[]> {
  const t = token();
  if (!t) return [];
  const p = new URLSearchParams({
    period_type: opts.periodType ?? 'year',
    one_way: opts.oneWay ? 'true' : 'false',
    page: '1',
    limit: String(opts.limit ?? 50),
    show_to_affiliates: 'true',
    sorting: 'price',
    trip_class: '0',
    currency: 'usd',
    token: t,
  });
  if (opts.origin)      p.set('origin', opts.origin);
  if (opts.destination) p.set('destination', opts.destination);
  const r = await fetch(`${HOST}/aviasales/v3/get_latest_prices?${p}`, { cache: 'no-store' });
  if (!r.ok) return [];
  // The TP "get_latest_prices" endpoint returns the price under `value`, not `price`.
  // Map onto our normalized LatestDeal shape so downstream code can rely on `price`.
  const j = await r.json() as { data?: Array<{
    origin: string; destination: string; value: number;
    depart_date: string; return_date: string | null;
    number_of_changes: number; found_at: string; trip_class: number;
  }> };
  const raw = j.data ?? [];
  let list: LatestDeal[] = raw.map(x => ({
    origin: x.origin, destination: x.destination,
    price: x.value,
    depart_date: x.depart_date,
    return_date: x.return_date,
    number_of_changes: x.number_of_changes,
    found_at: x.found_at,
    trip_class: x.trip_class,
  }));
  if (opts.maxPrice) list = list.filter(x => x.price <= opts.maxPrice!);
  return list;
}

/**
 * Cheapest fare per month for a route — useful for "best month to fly" widgets.
 * Returns one entry per month for the next 12 months when data is cached.
 */
export async function cheapestByMonth(origin: string, destination: string): Promise<Array<{ month: string; price: number; depart_date: string; return_date: string | null }>> {
  const t = token();
  if (!t) return [];
  const out: Array<{ month: string; price: number; depart_date: string; return_date: string | null }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getUTCFullYear(), now.getUTCMonth() + i, 1);
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const p = new URLSearchParams({ origin, destination, depart_date: month, currency: 'usd', token: t });
    try {
      const r = await fetch(`${HOST}/v1/prices/cheap?${p}`, { cache: 'no-store' });
      if (!r.ok) continue;
      const j = await r.json() as { data?: Record<string, Record<string, { price: number; departure_at: string; return_at?: string }>> };
      // Shape: data[destination][index] = { price, departure_at, return_at }
      const inner = j.data?.[destination] ?? {};
      const cheapest = Object.values(inner).sort((a, b) => a.price - b.price)[0];
      if (cheapest) {
        out.push({
          month,
          price: cheapest.price,
          depart_date: cheapest.departure_at,
          return_date: cheapest.return_at ?? null,
        });
      } else {
        out.push({ month, price: 0, depart_date: '', return_date: null });
      }
    } catch { /* skip */ }
  }
  return out;
}

// Common popular city pairs for the homepage carousel
export const POPULAR_HOMES: Array<{ code: string; label: string; emoji: string }> = [
  { code: 'NYC', label: 'New York',     emoji: '🗽' },
  { code: 'LAX', label: 'Los Angeles',  emoji: '🌴' },
  { code: 'LON', label: 'London',       emoji: '🇬🇧' },
  { code: 'PAR', label: 'Paris',        emoji: '🗼' },
  { code: 'DXB', label: 'Dubai',        emoji: '🇦🇪' },
  { code: 'CAI', label: 'Cairo',        emoji: '🇪🇬' },
  { code: 'TYO', label: 'Tokyo',        emoji: '🗾' },
  { code: 'SIN', label: 'Singapore',    emoji: '🇸🇬' },
];

// Friendly names for common IATA city/airport codes shown in the worldwide explorer.
const CITY_NAMES: Record<string, string> = {
  NYC: 'New York', JFK: 'New York (JFK)', EWR: 'Newark', LAX: 'Los Angeles',
  LON: 'London', LHR: 'London Heathrow', PAR: 'Paris', CDG: 'Paris CDG',
  CAI: 'Cairo', DXB: 'Dubai', AUH: 'Abu Dhabi', DOH: 'Doha',
  IST: 'Istanbul', FRA: 'Frankfurt', AMS: 'Amsterdam', MAD: 'Madrid', BCN: 'Barcelona',
  ROM: 'Rome', FCO: 'Rome FCO', MIL: 'Milan',
  TYO: 'Tokyo', HND: 'Tokyo Haneda', NRT: 'Tokyo Narita',
  SIN: 'Singapore', BKK: 'Bangkok', HKG: 'Hong Kong', DEL: 'Delhi', BOM: 'Mumbai',
  SYD: 'Sydney', MEL: 'Melbourne', JNB: 'Johannesburg',
  MEX: 'Mexico City', CUN: 'Cancun', PUJ: 'Punta Cana', SDQ: 'Santo Domingo',
  STI: 'Santiago DR', MIA: 'Miami', ORL: 'Orlando', FLL: 'Fort Lauderdale',
  ATL: 'Atlanta', LAS: 'Las Vegas', SFO: 'San Francisco', SEA: 'Seattle',
  TAS: 'Tashkent', MOW: 'Moscow', LOS: 'Lagos',
  ALG: 'Algiers', RAK: 'Marrakech', NBO: 'Nairobi', CMN: 'Casablanca',
};

export function cityName(code: string): string {
  return CITY_NAMES[code.toUpperCase()] ?? code;
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtUSD = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const fmtEGP = (usd: number, rate: number) =>
  (usd * rate).toLocaleString('en-US', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 });

export const fmtUSDcents = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

export const fmtDate = (iso: string) => {
  // Bare YYYY-MM-DD strings get parsed as UTC midnight by `new Date()`, which
  // can render as the previous day in negative-offset timezones (US west coast).
  // Pin the output to UTC so a stored "2026-07-15" always shows as Jul 15.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const fmtRelative = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
};

export const PIE_COLORS = ['#0a3a6b', '#d4af37', '#0f766e', '#9333ea', '#dc2626', '#0891b2'];

/**
 * Build an Aviasales deep-link pre-filled with origin, destination, both dates, party,
 * EgyptAir filter, and direct-only filter. Lands on a review/pay page — user only needs to click "Buy".
 *
 * Aviasales URL format (round-trip): /search/{ORIG}{DDMM}{DEST}{DDMM}{ORIG}{ADULTS}
 *   e.g. JFK May 12 → CAI May 25, 4 adults: /search/JFK1205CAI2505JFK4
 * Query params:
 *   - carriers=MS    → EgyptAir only
 *   - direct=true    → nonstop only (omit for EWR — no nonstops exist)
 *   - currency=usd
 * Infants on lap are added on the passenger-info step (Aviasales URL doesn't take them).
 *
 * If the Travelpayouts API gave us a specific offer link (with a `t=...` token), use that
 * instead — it points at the exact cached fare.
 */
export function bookingLink(opts: {
  origin: string;
  destination: string;
  departDate: string; // YYYY-MM-DD
  returnDate: string; // YYYY-MM-DD
  adults: number;
  infants: number;
  /** Travelpayouts-supplied offer path (e.g. "/search/JFK2505CAI?t=..."). If present, used verbatim. */
  offerPath?: string | null;
}): string {
  const BASE = 'https://www.aviasales.com';
  if (opts.offerPath && opts.offerPath.startsWith('/')) {
    return `${BASE}${opts.offerPath}`;
  }
  const ddmm = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${d}${m}`;
  };
  const dep = ddmm(opts.departDate);
  const ret = ddmm(opts.returnDate);
  const direct = opts.origin === 'JFK' ? '&direct=true' : ''; // EWR → CAI has no nonstops
  return `${BASE}/search/${opts.origin}${dep}${opts.destination}${ret}${opts.origin}${opts.adults}?carriers=MS&currency=usd${direct}`;
}

/**
 * Build comparison-shopping deep links so the user can cross-check the same
 * itinerary on five OTAs / search engines in one click. None of these need
 * an API key — they're just pre-filled search URLs.
 */
// EgyptAir option is shown ONLY for the two routes the user actually cares
// about for the FlyCheap brand: New York (JFK or EWR, or the NYC metaroute)
// ↔ Cairo. Per user direction — everything else hides the option to avoid
// dumping users on egyptair.com with no flight.
const EGYPTAIR_NEW_YORK = new Set(['NYC', 'JFK', 'EWR']);
export function egyptairFlies(origin: string, destination: string): boolean {
  const o = origin.toUpperCase();
  const d = destination.toUpperCase();
  // NY → CAI
  if (EGYPTAIR_NEW_YORK.has(o) && d === 'CAI') return true;
  // CAI → NY (return leg / reverse booking)
  if (o === 'CAI' && EGYPTAIR_NEW_YORK.has(d)) return true;
  return false;
}

export function crossShopLinks(opts: {
  origin: string;
  destination: string;
  departDate: string;   // YYYY-MM-DD
  returnDate: string;
  adults: number;
  infants: number;
  offerPath?: string | null;
}): Array<{ name: string; short: string; href: string; color: string; earns?: boolean }> {
  const { origin, destination, departDate, returnDate, adults, infants } = opts;
  const showEgyptair = egyptairFlies(origin, destination);
  return [
    {
      name: 'Aviasales (cached)', short: 'Aviasales',
      color: '#0a3a6b', earns: true,
      href: bookingLink(opts),
    },
    {
      name: 'Google Flights', short: 'Google',
      color: '#4285F4',
      href: `https://www.google.com/travel/flights?q=Flights%20from%20${origin}%20to%20${destination}%20on%20${departDate}%20returning%20${returnDate}%20${adults}%20adult${adults > 1 ? 's' : ''}${infants > 0 ? `%20${infants}%20infant` : ''}`,
    },
    {
      name: 'Kayak', short: 'Kayak',
      color: '#FF690F',
      href: `https://www.kayak.com/flights/${origin}-${destination}/${departDate}/${returnDate}/${adults}adults${infants > 0 ? `-${infants}lap` : ''}?sort=price_a&fs=airlines=MS`,
    },
    {
      name: 'Skyscanner', short: 'Skyscanner',
      // Affiliate programme exists; `associateid` is injected by /go once
      // SKYSCANNER_ASSOCIATE_ID is set, so this ranks with the earning group.
      color: '#0770E3', earns: true,
      href: `https://www.skyscanner.com/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/${departDate.slice(2,4)}${departDate.slice(5,7)}${departDate.slice(8,10)}/${returnDate.slice(2,4)}${returnDate.slice(5,7)}${returnDate.slice(8,10)}/?adults=${adults}&infants=${infants}&cabinclass=economy&preferdirects=${origin === 'JFK' ? 'true' : 'false'}`,
    },
    {
      name: 'Momondo', short: 'Momondo',
      color: '#E31C79',
      href: `https://www.momondo.com/flight-search/${origin}-${destination}/${departDate}/${returnDate}/${adults}adults${infants > 0 ? `?children=${'L'.repeat(infants)}` : ''}`,
    },
    // EgyptAir's own IBE doesn't accept clean URL deep-links (it's an Amadeus
    // engine that uses POST forms). So this entry links to Aviasales with the
    // EgyptAir (MS) carrier filter pre-applied — user sees only EgyptAir
    // flights on the route, and the booking is still through our affiliate.
    // Label says "EgyptAir flights" not "book direct" since the actual ticket
    // is issued by Aviasales' GDS partner that does the OTA booking.
    ...(showEgyptair ? [{
      name: 'EgyptAir flights', short: 'EgyptAir',
      color: '#0a3a6b', earns: true,
      href: `https://www.aviasales.com/search/${origin}${(() => { const [, m, d] = departDate.split('-'); return d + m; })()}${destination}${(() => { const [, m, d] = returnDate.split('-'); return d + m; })()}${adults}?currency=usd&airlines=MS`,
    }] : []),
  ]
    // Partners that pay a commission lead; pure comparison sites (Google,
    // Kayak, Momondo) follow. Deliberately a REORDER, not a removal — the
    // compare options are a trust feature, and a user who feels steered is
    // worth less than the click, since one Pro subscriber ≈ 90 flight clicks.
    .sort((a, b) => Number(b.earns ?? false) - Number(a.earns ?? false));
}


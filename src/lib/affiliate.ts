// Non-Aviasales affiliate URL builders. Aviasales itself still goes through
// bookingLink() in lib/utils.ts → /go, which appends marker server-side.
// Brands covered here:
//   - Hotellook  (hotel metasearch, same Travelpayouts marker pool)
//   - WayAway    (cashback flights, same TP marker)
//   - Trip.com   (Metasearch tier — Allianceid + SID per partner)
//   - Skyscanner (DECLINED 2026-05; cross-shop link kept, no associate_id)
//   - Booking.com (Affiliate Partner Programme — uses ?aid=<AID>&label=...)
//     Sign-up: https://partner.booking.com/en-us/affiliate-program
//     Env var: NEXT_PUBLIC_BOOKING_AID (client-readable, used in HotelsGrid
//              chips). Server-side admin/integrations row reads BOOKING_AID
//              as a convenience alias for the same value.
//   - Expedia (Expedia Group Affiliate — uses ?siteid=<ID>&clickref=<sub>)
//     Sign-up: https://www.expediagroup.com/affiliate-marketing/
//     Env var: NEXT_PUBLIC_EXPEDIA_SITEID. Same client-readable convention.
// Each builder reads its env-side identifier; when called from a client
// component the value is `undefined` and /go fills it in server-side.

const TP_MARKER = process.env.AVIASALES_MARKER || process.env.TRAVELPAYOUTS_MARKER;

/**
 * Travelpayouts referral link for footer/about/privacy mentions. Builds
 * `https://www.travelpayouts.com/?marker=<our-marker>` so the marker is read
 * from env at request time rather than hardcoded across multiple files —
 * if the marker rotates, only the env var has to change. Falls back to a
 * documented marker (the public one we shipped with) only if the env var
 * is missing on a fresh deploy.
 */
export function travelpayoutsReferralUrl(): string {
  const marker = TP_MARKER ?? '727998';
  return `https://www.travelpayouts.com/?marker=${marker}`;
}

// Tuple form so we can both derive the type AND iterate at runtime
// (for /go's validate-on-insert check). Adding a new surface requires
// updating only this list.
export const AFFILIATE_SURFACES = [
  'dashboard-cheapest-card',
  'dashboard-tracked-table',
  'deals-table',
  'offers-page',
  'hotels-grid',
  'heatmap',
  'nadia-concierge',
  'email-alert',
  'email-digest',
  'explore-page',
  'explore-map-panel',
  'explore-slideshow',
  'explore-destinations-slideshow',
  'hotels-slideshow',
  'airbnbs-slideshow',
  'rentals-page',
  'offers-results-table',
  'search-form',
  'searches-tracked-table',
  'share-page',
  'mobile-app',
] as const;
export type AffiliateSurface = (typeof AFFILIATE_SURFACES)[number];

/** Type guard — use at the /go boundary to detect typos / fabricated surfaces. */
export function isValidSurface(s: string | null | undefined): s is AffiliateSurface {
  return typeof s === 'string' && (AFFILIATE_SURFACES as readonly string[]).includes(s);
}

// Provider tuple — the affiliate brand the click was routed to. The DB
// column is still TEXT (free-form for forward-compat) but /go validates
// against this list and logs a WARN for unknowns, catching typos like
// 'tripcom-' or 'avia-sales' before they pollute the revenue dashboard.
export const AFFILIATE_PROVIDERS = [
  'aviasales',
  'aviasales-tpk',
  'hotellook',
  'wayaway',
  'tripcom',
  'skyscanner',
  // Booking + Expedia: chip targets on the hotels grid. When the per-program
  // env var is set (NEXT_PUBLIC_BOOKING_AID / NEXT_PUBLIC_EXPEDIA_SITEID) the
  // affiliate ID is appended to the deeplink; without it the click still
  // attributes to the brand so the dashboard reflects user preference even
  // before sign-up completes.
  'booking',
  'expedia',
  // Cross-shop providers from BookButton's dropdown. No commission programs
  // for us, but logged so we can see which provider users prefer.
  // Travelpayouts attach brands. Far higher value per action than a flight
  // click: EKTA pays 20% of the insurance premium, Kiwitaxi 50% of its
  // revenue share. Both live inside the existing Travelpayouts account, so
  // there is no second contract and no second payout to reconcile.
  'ekta',
  'kiwitaxi',
  'google',
  'kayak',
  'momondo',
  'egyptair',       // direct airline — no commission, may be cheapest
  'email-digest',   // legacy — some old click rows used surface-as-provider
  'travelpayouts',  // legacy
] as const;
export type AffiliateProvider = (typeof AFFILIATE_PROVIDERS)[number];

export function isValidProvider(p: string | null | undefined): p is AffiliateProvider {
  return typeof p === 'string' && (AFFILIATE_PROVIDERS as readonly string[]).includes(p);
}

export interface AffiliateLinkOptions {
  surface: AffiliateSurface;
  routeId?: string;
  position?: number;
}

export function buildSubId(opts: AffiliateLinkOptions): string {
  return [opts.surface, opts.routeId, opts.position]
    .filter((v) => v !== undefined && v !== null && v !== '')
    .join('.');
}

/** Deterministic routeId string used as the secondary segment of sub_id. */
export function buildRouteId(opts: {
  origin: string;
  destination: string;
  departDate: string;   // YYYY-MM-DD
  returnDate?: string;
  adults?: number;
}): string {
  const dep = opts.departDate.replace(/-/g, '');
  const ret = opts.returnDate ? opts.returnDate.replace(/-/g, '') : '';
  const parts = [opts.origin, opts.destination, dep];
  if (ret) parts.push(ret);
  if (opts.adults) parts.push(String(opts.adults));
  return parts.join('-');
}

// IATA airport/city codes → plain English city name for hotel search.
// Hotellook's deeplink rejects 3-letter IATA codes (e.g. "CAI") and silently
// redirects to booking.com with no destination filter. Passing the city
// name ("Cairo") lands users on the correct results page with our affiliate
// marker preserved. Strip airport-qualifiers like "(JFK)" or "Heathrow"
// so "London Heathrow" → "London".
const IATA_TO_CITY_FOR_HOTEL: Record<string, string> = {
  NYC: 'New York', JFK: 'New York', EWR: 'New York', LGA: 'New York',
  LAX: 'Los Angeles', SFO: 'San Francisco', SEA: 'Seattle', MIA: 'Miami',
  ORL: 'Orlando', MCO: 'Orlando', FLL: 'Fort Lauderdale', ATL: 'Atlanta',
  LAS: 'Las Vegas', BOS: 'Boston', IAD: 'Washington', DCA: 'Washington',
  DFW: 'Dallas', ORD: 'Chicago', PHX: 'Phoenix', YYZ: 'Toronto', YUL: 'Montreal',
  LON: 'London', LHR: 'London', LGW: 'London', LCY: 'London', STN: 'London',
  PAR: 'Paris', CDG: 'Paris', ORY: 'Paris', AMS: 'Amsterdam', FRA: 'Frankfurt',
  BER: 'Berlin', MAD: 'Madrid', BCN: 'Barcelona', ROM: 'Rome', FCO: 'Rome',
  MIL: 'Milan', MXP: 'Milan', LIN: 'Milan', LIS: 'Lisbon', ATH: 'Athens',
  ZRH: 'Zurich', VIE: 'Vienna', DUB: 'Dublin', CPH: 'Copenhagen', OSL: 'Oslo',
  STO: 'Stockholm', HEL: 'Helsinki', IST: 'Istanbul', WAW: 'Warsaw', PRG: 'Prague',
  BUD: 'Budapest',
  CAI: 'Cairo', DXB: 'Dubai', AUH: 'Abu Dhabi', DOH: 'Doha', RUH: 'Riyadh',
  JED: 'Jeddah', BEY: 'Beirut', TLV: 'Tel Aviv', RAK: 'Marrakech', CMN: 'Casablanca',
  NBO: 'Nairobi', JNB: 'Johannesburg', CPT: 'Cape Town', ADD: 'Addis Ababa',
  ALG: 'Algiers', LOS: 'Lagos',
  // Egyptian beach / resort airports — common all-inclusive destinations for
  // the FlyCheap brand audience. Without these, hotel deeplinks for those
  // IATA codes fell back to the raw code which Hotellook silently rejects.
  SSH: 'Sharm El Sheikh', HRG: 'Hurghada', RMF: 'Marsa Alam', LXR: 'Luxor',
  ASW: 'Aswan', HBE: 'Alexandria', ABS: 'Abu Simbel',
  // Other resort / vacation hot spots the hotel destination dropdown lists.
  MLE: 'Maldives', DPS: 'Bali', HKT: 'Phuket', CUN: 'Cancun', PUJ: 'Punta Cana',
  NAS: 'Nassau', JTR: 'Santorini', JMK: 'Mykonos', PMI: 'Mallorca',
  TFS: 'Tenerife', OGG: 'Maui', HNL: 'Honolulu', CFU: 'Corfu', HER: 'Crete',
  RHO: 'Rhodes', IBZ: 'Ibiza', LCA: 'Larnaca', PFO: 'Paphos', AYT: 'Antalya',
  BJV: 'Bodrum', GZP: 'Alanya',
  TYO: 'Tokyo', NRT: 'Tokyo', HND: 'Tokyo', OSA: 'Osaka', HKG: 'Hong Kong',
  BKK: 'Bangkok', SIN: 'Singapore', KUL: 'Kuala Lumpur', DEL: 'Delhi',
  BOM: 'Mumbai', BLR: 'Bangalore', SHA: 'Shanghai', PVG: 'Shanghai',
  PEK: 'Beijing', ICN: 'Seoul', MNL: 'Manila',
  SYD: 'Sydney', MEL: 'Melbourne', BNE: 'Brisbane', AKL: 'Auckland',
  GRU: 'Sao Paulo', EZE: 'Buenos Aires', LIM: 'Lima', BOG: 'Bogota',
  SCL: 'Santiago', MEX: 'Mexico City', CUN: 'Cancun', PUJ: 'Punta Cana',
  SDQ: 'Santo Domingo', SJU: 'San Juan', NAS: 'Nassau',
};

/** Resolve a destination input (IATA code or already a city name) to a clean
 *  city name suitable for hotellook's destination= param. Unknown 3-letter
 *  codes pass through unchanged so we don't make things worse for users who
 *  type a real city name like "Cairo". */
export function hotelCityForDestination(input: string): string {
  const trimmed = String(input || '').trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  if (IATA_TO_CITY_FOR_HOTEL[upper]) return IATA_TO_CITY_FOR_HOTEL[upper];
  // If it looks like a 3-letter IATA we don't know, strip nothing — hotellook
  // will fall back to booking.com with at-least the raw token in the URL.
  return trimmed;
}

/**
 * Hotellook hotel-search deeplink. Uses the same Travelpayouts marker pool
 * as Aviasales. Accepts either an IATA code or a city name as `destination`
 * — IATA codes are converted to plain city names because Hotellook's
 * deeplink rejects 3-letter codes and silently redirects elsewhere.
 */
export function hotellookLink(opts: {
  destination: string;
  checkIn: string;     // YYYY-MM-DD
  checkOut: string;    // YYYY-MM-DD
  adults?: number;
  surface: AffiliateSurface;
  routeId?: string;
}): string {
  const u = new URL('https://search.hotellook.com/');
  u.searchParams.set('destination', hotelCityForDestination(opts.destination));
  u.searchParams.set('checkIn', opts.checkIn);
  u.searchParams.set('checkOut', opts.checkOut);
  u.searchParams.set('adults', String(opts.adults ?? 2));
  if (TP_MARKER) u.searchParams.set('marker', TP_MARKER);
  u.searchParams.set('sub_id', buildSubId({ surface: opts.surface, routeId: opts.routeId }));
  return u.toString();
}

// Explicit hostname → provider mapping. Previously we inferred provider from
// the destination URL by splitting `hostname.split('.')[0]` which gave
// `aviasales.tpk.lu → aviasales` (right) but `us.trip.com → us` (wrong) and
// `search.hotellook.com → search` if the regex strip missed. Keeping it as
// an explicit table prevents silent mis-attribution in the revenue dashboard.
const HOST_TO_PROVIDER: Record<string, string> = {
  'aviasales.com':         'aviasales',
  'www.aviasales.com':     'aviasales',
  'hotellook.com':         'hotellook',
  'www.hotellook.com':     'hotellook',
  'search.hotellook.com':  'hotellook',
  'wayaway.io':            'wayaway',
  'www.wayaway.io':        'wayaway',
  'trip.com':              'tripcom',
  'www.trip.com':          'tripcom',
  'm.trip.com':            'tripcom',
  'us.trip.com':           'tripcom',
  'skyscanner.com':        'skyscanner',
  'www.skyscanner.com':    'skyscanner',
  'booking.com':           'booking',
  'www.booking.com':       'booking',
  'expedia.com':           'expedia',
  'www.expedia.com':       'expedia',
  'aviasales.tpk.lu':      'aviasales-tpk',
  'tpk.lu':                'aviasales-tpk',
  'www.tpk.lu':            'aviasales-tpk',
};

function providerForHost(destUrl: string): string {
  try {
    const host = new URL(destUrl).hostname.toLowerCase().replace(/\.$/, '');
    return HOST_TO_PROVIDER[host] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Wrap any external affiliate URL in the existing /go redirect so the click is
 * logged to affiliate_clicks. Use for hotellook/wayaway/etc — Aviasales has
 * its own path via bookingLink() which already routes through /go.
 */
export function trackedRedirect(
  destUrl: string,
  opts: AffiliateLinkOptions & { baseUrl?: string; provider?: string },
): string {
  const qs = new URLSearchParams({
    to: destUrl,
    provider: opts.provider ?? providerForHost(destUrl),
    surface: opts.surface,
  });
  if (opts.routeId) {
    qs.set('route_id', opts.routeId);
    const [origin, destination, dep, ret] = opts.routeId.split('-');
    if (origin) qs.set('origin', origin);
    if (destination) qs.set('destination', destination);
    if (dep && /^\d{8}$/.test(dep)) qs.set('dep', `${dep.slice(0,4)}-${dep.slice(4,6)}-${dep.slice(6,8)}`);
    if (ret && /^\d{8}$/.test(ret)) qs.set('ret', `${ret.slice(0,4)}-${ret.slice(4,6)}-${ret.slice(6,8)}`);
  }
  const p = `/go?${qs.toString()}`;
  return opts.baseUrl ? `${opts.baseUrl.replace(/\/$/, '')}${p}` : p;
}

/**
 * WayAway (Travelpayouts cashback-focused flight brand) deeplink.
 * Verify exact URL format in Travelpayouts dashboard → Tools → Deeplinks
 * before relying on this in production.
 */
export function waywayLink(opts: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  adults?: number;
  surface: AffiliateSurface;
  routeId?: string;
}): string {
  const ddmm = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${d}${m}`;
  };
  let path = `${opts.origin}${ddmm(opts.departDate)}${opts.destination}`;
  if (opts.returnDate) path += ddmm(opts.returnDate);
  path += String(opts.adults ?? 1);

  const u = new URL(`https://wayaway.io/flights/${path}`);
  if (TP_MARKER) u.searchParams.set('marker', TP_MARKER);
  u.searchParams.set('sub_id', buildSubId({ surface: opts.surface, routeId: opts.routeId }));
  return u.toString();
}

// ---------------------------------------------------------------------------
// Trip.com (Metasearch tier — pay-per-booking, $5-15 per flight, 4-7% per hotel)
// ---------------------------------------------------------------------------
const TRIPCOM_ALLIANCE_ID = process.env.TRIPCOM_ALLIANCE_ID;
const TRIPCOM_DEFAULT_SID = process.env.TRIPCOM_SID;

function tripcomParams(opts: AffiliateLinkOptions): Record<string, string> {
  const params: Record<string, string> = {};
  if (TRIPCOM_ALLIANCE_ID) params.Allianceid = TRIPCOM_ALLIANCE_ID;
  // Override the default SID with our per-surface tracking so we can see in
  // the Trip.com dashboard which surface (dashboard / deals-table / FarePilot)
  // drives bookings. Falls back to the env default if surface tracking
  // isn't possible (e.g., legacy callers).
  params.SID = TRIPCOM_DEFAULT_SID ?? '0';
  params.trip_sub1 = opts.surface;
  if (opts.routeId) params.trip_sub3 = opts.routeId;
  return params;
}

/** Trip.com flight-search deeplink. Lands on their results page with the
 *  itinerary pre-filled. URL pattern reverse-engineered from their public
 *  search UI: /flights/showfarefirst with dcity/acity/ddate/rdate params. */
export function tripcomFlightLink(opts: {
  origin: string;
  destination: string;
  departDate: string;     // YYYY-MM-DD
  returnDate?: string;
  adults?: number;
  surface: AffiliateSurface;
  routeId?: string;
}): string {
  const u = new URL('https://www.trip.com/flights/showfarefirst');
  u.searchParams.set('dcity', opts.origin.toLowerCase());
  u.searchParams.set('acity', opts.destination.toLowerCase());
  u.searchParams.set('ddate', opts.departDate);
  if (opts.returnDate) {
    u.searchParams.set('rdate', opts.returnDate);
    u.searchParams.set('flighttype', 'rt');  // round-trip
  } else {
    u.searchParams.set('flighttype', 'ow');
  }
  u.searchParams.set('class', 'y');           // economy
  u.searchParams.set('quantity', String(opts.adults ?? 1));
  // Append affiliate tracking params
  for (const [k, v] of Object.entries(tripcomParams({ surface: opts.surface, routeId: opts.routeId }))) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

// ---------------------------------------------------------------------------
// Skyscanner (Partner Programme — Metasearch tier; pay-per-click + bonus CPS).
//
// STATUS (2026-05-15): APPLICATION DECLINED. Skyscanner's stated reason set
// included low traffic volume (<5k uniques/mo), site age (<1 year), and the
// vague "poor quality/UX" catch-all. We're addressing those by building out
// /routes, /destinations, /guides editorial content and growing traffic, then
// re-applying in ~90 days.
//
// In the meantime we KEEP the Skyscanner link builder live — the buttons
// still render in the cross-shop dropdown as price-comparison options for
// users (legitimately useful, even if we earn nothing from them). The link
// just goes to skyscanner.com without our associate_id appended.
//
// When we re-apply and get approved, set SKYSCANNER_ASSOCIATE_ID in the env
// and every existing button starts attributing — zero code change needed.
// Also re-add Skyscanner to the affiliate disclosure lists in /about and
// /privacy at that point.
// ---------------------------------------------------------------------------
const SKYSCANNER_ASSOCIATE_ID = process.env.SKYSCANNER_ASSOCIATE_ID;

/** Skyscanner flight-search deeplink. URL pattern matches their public search
 *  form: /transport/flights/{ORIG}/{DEST}/{YYMMDD}/{YYMMDD}/?adults=N. When
 *  SKYSCANNER_ASSOCIATE_ID is set, ?associateid= is appended for tracking. */
export function skyscannerLink(opts: {
  origin: string;
  destination: string;
  departDate: string;       // YYYY-MM-DD
  returnDate?: string;
  adults?: number;
  infants?: number;
  surface: AffiliateSurface;
  routeId?: string;
}): string {
  const yymmdd = (iso: string) =>
    `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`;
  let path = `/transport/flights/${opts.origin.toLowerCase()}/${opts.destination.toLowerCase()}/${yymmdd(opts.departDate)}`;
  if (opts.returnDate) path += `/${yymmdd(opts.returnDate)}`;
  const u = new URL(`https://www.skyscanner.com${path}/`);
  u.searchParams.set('adults', String(opts.adults ?? 1));
  if (opts.infants) u.searchParams.set('infants', String(opts.infants));
  u.searchParams.set('cabinclass', 'economy');
  // Direct-only filter for JFK (only nonstop JFK→CAI exists on EgyptAir);
  // disable for EWR which has no nonstops.
  u.searchParams.set('preferdirects', opts.origin === 'JFK' ? 'true' : 'false');
  // Affiliate attribution — populated when the env var is set after approval
  if (SKYSCANNER_ASSOCIATE_ID) {
    u.searchParams.set('associateid', SKYSCANNER_ASSOCIATE_ID);
    u.searchParams.set('subid', buildSubId({ surface: opts.surface, routeId: opts.routeId }));
  }
  return u.toString();
}

// ---------------------------------------------------------------------------
// Booking.com — Affiliate Partner Programme. Uses ?aid= as the affiliate id
// and &label= as a free-form sub-tracker. We only have one URL builder
// (no separate deeplink format for hotel-detail vs city-search), so all
// callers funnel through buildBookingUrl().
// ---------------------------------------------------------------------------
export function buildBookingUrl(opts: {
  city: string;          // plain English city, e.g. "Sharm El Sheikh"
  checkIn: string;       // YYYY-MM-DD
  checkOut: string;
  adults: number;
  children?: number;
  label?: string;        // free-form sub-tracker; defaults to 'hotels-grid'
}): string {
  const u = new URL('https://www.booking.com/searchresults.html');
  u.searchParams.set('ss', opts.city);
  u.searchParams.set('checkin', opts.checkIn);
  u.searchParams.set('checkout', opts.checkOut);
  u.searchParams.set('group_adults', String(opts.adults));
  if (opts.children && opts.children > 0) u.searchParams.set('group_children', String(opts.children));
  // Read NEXT_PUBLIC_ prefix — these builders are imported by 'use client'
  // components (HotelsGrid / HotelsSearchPanel), and bare process.env.X is
  // undefined in the browser bundle for non-NEXT_PUBLIC_ vars.
  const aid = process.env.NEXT_PUBLIC_BOOKING_AID;
  if (aid) {
    u.searchParams.set('aid', aid);
    u.searchParams.set('label', opts.label ?? 'hotels-grid');
  }
  return u.toString();
}

// ---------------------------------------------------------------------------
// Expedia Group Affiliate. Uses ?siteid= and &clickref= for sub-tracking.
// ---------------------------------------------------------------------------
export function buildExpediaUrl(opts: {
  city: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  clickref?: string;     // sub-id; defaults to 'hotels-grid'
}): string {
  const u = new URL('https://www.expedia.com/Hotel-Search');
  u.searchParams.set('destination', opts.city);
  u.searchParams.set('startDate', opts.checkIn);
  u.searchParams.set('endDate', opts.checkOut);
  u.searchParams.set('adults', String(opts.adults));
  const siteid = process.env.NEXT_PUBLIC_EXPEDIA_SITEID;
  if (siteid) {
    u.searchParams.set('siteid', siteid);
    u.searchParams.set('clickref', opts.clickref ?? 'hotels-grid');
  }
  return u.toString();
}

/** Trip.com hotel-search deeplink. Trip.com is competitive on Asia hotel
 *  pricing — pairs well with HotelUpsell as a second option alongside
 *  Hotellook for users heading to Asian destinations. */
export function tripcomHotelLink(opts: {
  destinationCity: string;  // e.g. "Tokyo" or IATA like "NRT"
  checkIn: string;
  checkOut: string;
  adults?: number;
  surface: AffiliateSurface;
  routeId?: string;
}): string {
  const u = new URL('https://www.trip.com/hotels/list');
  u.searchParams.set('city', hotelCityForDestination(opts.destinationCity));
  u.searchParams.set('checkin', opts.checkIn);
  u.searchParams.set('checkout', opts.checkOut);
  u.searchParams.set('adult', String(opts.adults ?? 2));
  for (const [k, v] of Object.entries(tripcomParams({ surface: opts.surface, routeId: opts.routeId }))) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

// ---------------------------------------------------------------------------
// Aviasales (primary booking flow — Travelpayouts marker 727998).
// Moved here from lib/utils.ts so every affiliate URL builder lives in one
// place. lib/utils.ts re-exports it for back-compat with existing callers.
// ---------------------------------------------------------------------------

/**
 * Build an Aviasales deep-link pre-filled with origin, destination, both dates,
 * party, EgyptAir filter, and direct-only filter. Lands on a review/pay page —
 * user only needs to click "Buy".
 *
 * Aviasales URL format (round-trip): /search/{ORIG}{DDMM}{DEST}{DDMM}{ORIG}{ADULTS}
 *   e.g. JFK May 12 → CAI May 25, 4 adults: /search/JFK1205CAI2505JFK4
 *
 * Always routed through /go so the click is logged AND the Travelpayouts
 * marker is appended server-side (lib/app/go/route.ts). Without that wrap,
 * the outbound link carries no ?marker= and the booking pays $0 commission.
 */
export function bookingLink(opts: {
  origin: string;
  destination: string;
  departDate: string;   // YYYY-MM-DD
  returnDate: string;   // YYYY-MM-DD
  adults: number;
  infants: number;
  /** Travelpayouts-supplied offer path (e.g. "/search/JFK2505CAI?t=..."). If present, used verbatim. */
  offerPath?: string | null;
  /** Optional extra metadata logged to affiliate_clicks. */
  trackAs?: { searchId?: number; perAdult?: number; provider?: string; surface?: string; routeId?: string };
  /** Absolute origin to prepend (required for email/non-browser contexts). */
  baseUrl?: string;
}): string {
  const BASE = 'https://www.aviasales.com';
  let url: string;
  if (opts.offerPath && opts.offerPath.startsWith('/')) {
    url = `${BASE}${opts.offerPath}`;
  } else {
    const ddmm = (iso: string) => {
      const [, m, d] = iso.split('-');
      return `${d}${m}`;
    };
    const dep = ddmm(opts.departDate);
    const ret = ddmm(opts.returnDate);
    url = `${BASE}/search/${opts.origin}${dep}${opts.destination}${ret}${opts.origin}${opts.adults}?currency=usd`;
  }
  const qs = new URLSearchParams({
    to: url,
    origin: opts.origin, destination: opts.destination,
    dep: opts.departDate, ret: opts.returnDate,
  });
  if (opts.trackAs?.searchId !== undefined) qs.set('search_id', String(opts.trackAs.searchId));
  if (opts.trackAs?.perAdult !== undefined) qs.set('per', String(opts.trackAs.perAdult));
  if (opts.trackAs?.provider) qs.set('provider', opts.trackAs.provider);
  if (opts.trackAs?.surface) qs.set('surface', opts.trackAs.surface);
  if (opts.trackAs?.routeId) qs.set('route_id', opts.trackAs.routeId);
  const path = `/go?${qs.toString()}`;
  return opts.baseUrl ? `${opts.baseUrl.replace(/\/$/, '')}${path}` : path;
}

/**
 * Airbnb has no public affiliate program or API (closed 2021), so this is a
 * plain deep link into a prefilled Airbnb search. Routed through /go so the
 * click is still logged (provider 'airbnb', no commission).
 */
/** "Rome FCO" / "Rome (FCO)" / "FCO" → "Rome": strip IATA suffixes so Airbnb searches the city, not the airport. */
export function stayCityName(input: string): string {
  const raw = input.trim();
  const resolved = /^[A-Za-z]{3}$/.test(raw) ? hotelCityForDestination(raw) : raw;
  return resolved.replace(/\s*[\(\[]?[A-Z]{3}[\)\]]?\s*$/, '').replace(/\s*[–—-]\s*$/, '').trim() || resolved;
}

export function airbnbLink(opts: { destinationCity: string; checkIn: string; checkOut: string; adults: number }): string {
  const slug = encodeURIComponent(stayCityName(opts.destinationCity).replace(/\s+/g, '-'));
  const u = new URL(`https://www.airbnb.com/s/${slug}/homes`);
  u.searchParams.set('checkin', opts.checkIn);
  u.searchParams.set('checkout', opts.checkOut);
  u.searchParams.set('adults', String(Math.max(1, opts.adults)));
  u.searchParams.set('search_type', 'filter_change');
  return u.toString();
}

/** Vrbo (Expedia Group) vacation rentals — prefilled search deep link. */
export function vrboLink(opts: { destinationCity: string; checkIn: string; checkOut: string; adults: number }): string {
  const u = new URL('https://www.vrbo.com/search');
  u.searchParams.set('destination', stayCityName(opts.destinationCity));
  u.searchParams.set('startDate', opts.checkIn);
  u.searchParams.set('endDate', opts.checkOut);
  u.searchParams.set('adults', String(Math.max(1, opts.adults)));
  return u.toString();
}

// ---------------------------------------------------------------------------
// CJ Affiliate (Commission Junction) deep links.
//
// CJ is NOT a query-param program. Booking.com via CJ does not use ?aid= —
// that is Booking's own direct Affiliate Partner Programme and the two are
// mutually exclusive. A CJ click only attributes if it traverses a CJ
// tracking domain, and both that domain and the link id are assigned per
// advertiser out of CJ's link inventory. There is no format we can derive.
//
// So we don't try. After approval, copy ONE working deep link out of CJ's
// link inventory and store it as a template with {url} and {sid} markers:
//
//   CJ_LINK_BOOKING='https://www.anrdoezrs.net/links/7957203/type/dlg/sid/{sid}/{url}'
//
// The template lives in the server env only — never NEXT_PUBLIC_ — and is
// applied at the /go boundary, consistent with every other partner.
// ---------------------------------------------------------------------------

/** CJ's rotating tracking domains. A template must point at one of these —
 *  defence in depth so a malformed env value can't turn /go into an open
 *  redirect to an arbitrary host. */
const CJ_TRACKING_HOSTS = new Set([
  'anrdoezrs.net', 'www.anrdoezrs.net',
  'tkqlhce.com', 'www.tkqlhce.com',
  'jdoqocy.com', 'www.jdoqocy.com',
  'kqzyfj.com', 'www.kqzyfj.com',
  'dpbolvw.net', 'www.dpbolvw.net',
  'emjcd.com', 'www.emjcd.com',
  'ftjcfx.com', 'www.ftjcfx.com',
  'awltovhc.com', 'www.awltovhc.com',
  'lduhtrp.net', 'www.lduhtrp.net',
  'tqlkg.com', 'www.tqlkg.com',
  'qksrv.net', 'www.qksrv.net',
]);

/** Provider → env var holding that advertiser's CJ link template. */
const CJ_TEMPLATE_ENV: Partial<Record<AffiliateProvider, string>> = {
  booking: 'CJ_LINK_BOOKING',
  expedia: 'CJ_LINK_EXPEDIA',
};

/** Which of our providers a destination host belongs to, for CJ routing. */
export function cjProviderForHost(host: string): AffiliateProvider | null {
  if (host === 'booking.com' || host === 'www.booking.com') return 'booking';
  if (host === 'expedia.com' || host === 'www.expedia.com') return 'expedia';
  return null;
}

/** The configured CJ template for a provider, or null if not signed up yet. */
export function cjTemplateFor(provider: AffiliateProvider): string | null {
  const key = CJ_TEMPLATE_ENV[provider];
  if (!key) return null;
  const raw = process.env[key];
  return raw && raw.trim() ? raw.trim() : null;
}

/**
 * Wrap a destination URL in a CJ tracking link.
 *
 * Returns null — meaning "fall through to the direct program" — if the
 * template is missing, malformed, or doesn't point at a CJ domain. Never
 * throws: a broken template must not break the redirect.
 */
export function cjWrap(opts: { template: string; destination: string; sid?: string }): string | null {
  const { template, destination } = opts;
  if (!template.includes('{url}')) return null;

  // The template must itself be a valid https URL on a real CJ domain.
  let base: URL;
  try { base = new URL(template.replace('{url}', 'https://example.com').replace('{sid}', 'x')); }
  catch { return null; }
  if (base.protocol !== 'https:') return null;
  if (!CJ_TRACKING_HOSTS.has(base.hostname.toLowerCase().replace(/\.$/, ''))) return null;

  // CJ sub-ids are alphanumeric + a few separators; anything else is dropped
  // rather than escaped, because CJ silently truncates on unexpected chars.
  const sid = (opts.sid ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64) || 'flycheap';

  return template
    .replace('{url}', encodeURIComponent(destination))
    .replace('{sid}', sid);
}

// ---------------------------------------------------------------------------
// Travelpayouts attach brands (EKTA insurance, Kiwitaxi transfers).
//
// Same lesson as CJ: the SHAPE of a Travelpayouts click link is public
//   https://cNNN.travelpayouts.com/click?shmarker=<marker>.<sub>
//          &promo_id=<brand>&source_type=customlink&type=click&custom_url=<enc>
// but the VALUES are not derivable — promo_id is per-brand and the cNNN host
// varies per account/brand. A guessed promo_id yields a link that redirects
// perfectly and pays nothing, so we don't guess. Copy one link per brand out
// of the Travelpayouts dashboard and store it as a template:
//
//   TP_LINK_EKTA='https://c111.travelpayouts.com/click?shmarker=727998.{sub}&promo_id=XXXX&source_type=customlink&type=click&custom_url={url}'
//
// SECURITY: custom_url points anywhere, which makes these hosts open
// redirectors by design. Templates therefore live in server env ONLY and the
// final URL is always built by us — /go never accepts one as ?to=, and
// *.travelpayouts.com is deliberately absent from its allowlist.
// ---------------------------------------------------------------------------

/** Attach brands we can monetise through the existing Travelpayouts account. */
export type TpBrand = 'ekta' | 'kiwitaxi';

const TP_BRAND_ENV: Record<TpBrand, string> = {
  ekta: 'TP_LINK_EKTA',
  kiwitaxi: 'TP_LINK_KIWITAXI',
};

/** Hosts a Travelpayouts click template is allowed to point at. */
function isTpClickHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  // tpk.lu is Travelpayouts' short-link domain — the dashboard's "Copy link"
  // button hands out e.g. https://ektatraveling.tpk.lu/<code>, so a template
  // pasted straight from the UI lands here rather than on a c<NNN> host.
  return h === 'tp.media' || h === 'www.tp.media'
    || /^(?:[a-z0-9-]+\.)*travelpayouts\.com$/.test(h)
    || /^(?:[a-z0-9-]+\.)*tpk\.lu$/.test(h);
}

export function tpBrandConfigured(brand: TpBrand): boolean {
  const raw = process.env[TP_BRAND_ENV[brand]];
  return !!(raw && raw.trim());
}

/**
 * Build a Travelpayouts affiliate link for an attach brand.
 *
 * Returns null when the brand isn't configured or the template is malformed —
 * callers MUST treat null as "hide this option" rather than rendering a dead
 * link. Never throws.
 */
export function tpBrandLink(opts: { brand: TpBrand; sub?: string; customUrl?: string }): string | null {
  const raw = process.env[TP_BRAND_ENV[opts.brand]];
  if (!raw || !raw.trim()) return null;
  const template = raw.trim();

  // The template must be a valid https URL on a Travelpayouts click host.
  let probe: URL;
  try { probe = new URL(template.replace('{url}', 'https://example.com').replace('{sub}', 'x')); }
  catch { return null; }
  if (probe.protocol !== 'https:') return null;
  if (!isTpClickHost(probe.hostname)) return null;

  // SubID charset per Travelpayouts: latin alphanumerics + underscore. Dots
  // separate marker from SubID, so they must NOT survive into the sub itself.
  const sub = (opts.sub ?? '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 64) || 'flycheap';

  let out = template.replace('{sub}', sub);
  if (out.includes('{url}')) {
    // A template with {url} but no destination would ship a literal "{url}".
    if (!opts.customUrl) return null;
    let dest: URL;
    try { dest = new URL(opts.customUrl); } catch { return null; }
    if (dest.protocol !== 'https:') return null;
    out = out.replace('{url}', encodeURIComponent(dest.toString()));
  }
  return out;
}

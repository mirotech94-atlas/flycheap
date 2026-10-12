// Partner deep links.
//
// This file used to be the monetisation layer: a Travelpayouts marker pool
// across Aviasales / Hotellook / WayAway, Trip.com's Allianceid, Booking's
// ?aid=, Expedia's ?siteid=, CJ wrappers, and a sub-id scheme threaded through
// all of them. FlyCheap earns nothing now, so what is left is only the part
// that was always useful: building a correct search URL for each site, so a
// "Book" button lands on the right dates, route and passenger count instead of
// that site's homepage.
//
// Nothing here appends an identifier of any kind.

import {
  buildPartnerLink, routeIdFor,
  type PartnerProduct, type PartnerAlertType,
} from './partnerLink';


/**
 * Travelpayouts referral link for footer/about/privacy mentions. Builds
 * `https://www.travelpayouts.com/?marker=<our-marker>` so the marker is read
 * from env at request time rather than hardcoded across multiple files —
 * if the marker rotates, only the env var has to change. Falls back to a
 * documented marker (the public one we shipped with) only if the env var
 * is missing on a fresh deploy.
 */
/**
 * Travelpayouts click hosts. One marker pool covers all of them, so the list
 * lives here rather than inline in /go — two copies drift, and a host missing
 * from one copy means a link that goes out unattributed while the click log
 * claims it was attributed.
 */
export const TP_HOSTS: readonly string[] = [
  'aviasales.com', 'www.aviasales.com',
  'hotellook.com', 'www.hotellook.com', 'search.hotellook.com',
  'wayaway.io', 'www.wayaway.io',
  'aviasales.tpk.lu', 'tpk.lu', 'www.tpk.lu',
];

export function isTpHost(host: string): boolean {
  return TP_HOSTS.includes(host.toLowerCase().replace(/\.$/, ''));
}




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
  // Autonomous agent channels. These were emitting /go links with a surface
  // that was not in this list, so every click they produced was logged as a
  // typo-warning and never grouped in the funnel.
  'agent-social',
  'agent-email',
  // The trip chain — the post-booking sequence. Its own surface, separate from
  // 'email-alert', because the whole point of the reporting is to tell the
  // alert channel and the commercial channel apart.
  'email-chain',
  // The board — the decision screen. Kept apart from the old dashboard
  // surfaces because the whole question the board exists to answer is
  // whether a verdict-led card converts better than a table of fares.
  'board-card',
  'board-watch',
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

/**
 * The canonical Aviasales search deeplink shape.
 *
 * This URL format was being re-spelled in four places (utils.crossShopLinks,
 * bookUrl, the social-poster agent, the email-digest agent), which is exactly
 * how a channel ends up with a stale template nobody notices. One definition,
 * consumed by buildPartnerLink().
 *
 * NOTE: returns a BARE partner URL with no marker. It is only ever safe as the
 * `deeplink` argument to buildPartnerLink(), which routes it through /go where
 * the marker is attached server-side.
 */
export function aviasalesSearchLink(opts: {
  origin: string;
  destination: string;
  departDate: string;            // YYYY-MM-DD
  returnDate?: string | null;    // YYYY-MM-DD; omit for one-way
  adults?: number;
  airline?: string | null;       // IATA carrier filter, e.g. "MS"
}): string {
  const ddmm = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}${m[2]}` : '';
  };
  const adults = opts.adults ?? 1;
  const leg = `${opts.origin.toUpperCase()}${ddmm(opts.departDate)}${opts.destination.toUpperCase()}` +
              (opts.returnDate ? ddmm(opts.returnDate) : '');
  const qs = new URLSearchParams({ currency: 'usd' });
  if (opts.airline) qs.set('airlines', opts.airline.toUpperCase());
  return `https://www.aviasales.com/search/${leg}${adults}?${qs.toString()}`;
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
  SCL: 'Santiago', MEX: 'Mexico City', SDQ: 'Santo Domingo', SJU: 'San Juan',
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
  // No marker and no sub_id: this is a plain Hotellook search link now.
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
  opts: AffiliateLinkOptions & {
    baseUrl?: string; provider?: string;
    /** What is being sold — drives the product half of sub_id. Inferred from
     *  the destination host when omitted. */
    product?: PartnerProduct;
    alertId?: number | null;
    alertType?: PartnerAlertType;
    campaign?: string | null;
    tripId?: string | null;
  },
): string {
  // Also a thin adapter over the one builder, for the same reason bookingLink is.
  return buildPartnerLink({
    partner: (opts.provider as AffiliateProvider) ?? (providerForHost(destUrl) as AffiliateProvider),
    product: opts.product ?? productForHost(destUrl),
    deeplink: destUrl,
    baseUrl: opts.baseUrl ?? null,
    context: {
      surface: opts.surface,
      routeId: opts.routeId ?? null,
      optionRank: opts.position ?? null,
      alertId: opts.alertId ?? null,
      alertType: opts.alertType,
      campaign: opts.campaign ?? null,
      tripId: opts.tripId ?? null,
    },
  });
}

/**
 * Best guess at what a destination host is selling, for the product half of
 * sub_id. Only a fallback — callers that know should pass `product` explicitly,
 * because this axis is what the whole trip chain reports along and a wrong
 * guess is invisible until the numbers are already being read.
 *
 * Hosts that sell more than one category are discriminated on PATH, not host:
 * trip.com sells flights and hotels from the same domain, so keying on the host
 * alone silently filed every Trip.com flight click under hotels.
 */
export function productForHost(url: string): PartnerProduct {
  let host = '';
  let path = '';
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch { return 'flight'; }

  if (/kiwitaxi/.test(host)) return 'transfer';
  if (/ekta/.test(host)) return 'insurance';
  // Multi-category hosts: path decides.
  if (/trip\.com/.test(host)) {
    if (path.includes('/flight')) return 'flight';
    if (path.includes('/carhire') || path.includes('/cars')) return 'car';
    if (path.includes('/things-to-do') || path.includes('/tours')) return 'tour';
    return 'hotel';
  }
  if (/hotellook|booking\.com|expedia|airbnb|vrbo/.test(host)) return 'hotel';
  return 'flight';
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
  // No marker and no sub_id: a plain WayAway search link.
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
  // No ?aid= and no &label=. These were read from NEXT_PUBLIC_BOOKING_AID
  // because the builder is imported by 'use client' components and a bare
  // process.env is undefined in the browser bundle — which also meant the
  // affiliate id shipped to every visitor's browser. It earns nothing now and
  // is not sent.
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
  // No ?siteid= and no &clickref=, for the same reason as Booking above.
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
  /** Optional extra metadata logged to affiliate_clicks (the click_out row). */
  trackAs?: {
    searchId?: number; perAdult?: number; provider?: string;
    surface?: AffiliateSurface | string; routeId?: string;
    /** The alerts_sent row this link descends from — closes the alert→click join. */
    alertId?: number | null;
    alertType?: PartnerAlertType;
    /** Buy/wait call shown next to this price, and its confidence. */
    verdict?: 'buy' | 'wait' | 'hold' | null;
    confidencePct?: number | null;
    /** Position in a cross-shop list, and the option's display name. */
    optionRank?: number | null;
    optionName?: string | null;
    campaign?: string | null;
    tripId?: string | null;
  };
  /** Absolute origin to prepend (required for email/non-browser contexts). */
  baseUrl?: string;
}): string {
  // Thin adapter over the ONE builder. Keeping the signature means ~30 existing
  // call sites keep working and all of them pick up the sub-ID payload at once;
  // rewriting each call site by hand is precisely how a channel gets missed.
  // A Travelpayouts-supplied offer path is used as-is. Note that /go parses the
  // destination with `new URL()` and re-serialises it, which normalises the raw
  // query encoding (a literal `~` comes out as `%7E`). Decoded parameter values
  // are unchanged, so a token signed over decoded values is unaffected; a token
  // signed over the raw query string would not survive. That is pre-existing
  // /go behaviour on every outbound link, not specific to this branch.
  const offer = opts.offerPath && opts.offerPath.startsWith('/')
    ? `https://www.aviasales.com${opts.offerPath}`
    : null;
  return buildPartnerLink({
    partner: (opts.trackAs?.provider as AffiliateProvider) ?? 'aviasales',
    product: 'flight',
    baseUrl: opts.baseUrl ?? null,
    deeplink: offer ?? aviasalesSearchLink({
      origin: opts.origin, destination: opts.destination,
      departDate: opts.departDate, returnDate: opts.returnDate,
      adults: opts.adults,
    }),
    context: {
      surface: (opts.trackAs?.surface as AffiliateSurface) ?? 'dashboard-cheapest-card',
      routeId: opts.trackAs?.routeId
        ?? routeIdFor({ origin: opts.origin, destination: opts.destination,
                        departDate: opts.departDate, returnDate: opts.returnDate }),
      searchId: opts.trackAs?.searchId ?? null,
      priceShownUsd: opts.trackAs?.perAdult ?? null,
      alertId: opts.trackAs?.alertId ?? null,
      alertType: opts.trackAs?.alertType,
      verdict: opts.trackAs?.verdict ?? null,
      confidencePct: opts.trackAs?.confidencePct ?? null,
      optionRank: opts.trackAs?.optionRank ?? null,
      optionName: opts.trackAs?.optionName ?? null,
      campaign: opts.trackAs?.campaign ?? null,
      tripId: opts.trackAs?.tripId ?? null,
    },
  });
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

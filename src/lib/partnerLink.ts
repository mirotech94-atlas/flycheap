/**
 * The one partner-link builder. No exceptions.
 *
 * Every outbound partner link in the product — web, email, SMS, WhatsApp,
 * Telegram, the concierge, the API, the share board — comes from here. It takes
 * a structured context and returns a URL. Nothing else in the codebase writes a
 * partner URL.
 *
 * WHY IT RETURNS A `/go` URL RATHER THAN A PARTNER URL
 * ----------------------------------------------------
 * The spec asks for one function that returns the final partner URL. This
 * codebase cannot do that safely, and the reason is load-bearing: link builders
 * run in client-bundled code (BookButton.tsx is 'use client'), where
 * `process.env.AVIASALES_MARKER` is `undefined`. A client-built partner URL
 * ships WITHOUT its marker — which is exactly the marker bug that has already
 * bitten this product once.
 *
 * So the single audited code path is two halves that are both server-truthful:
 *
 *   buildPartnerLink()  →  /go?...           (safe anywhere, carries the context)
 *   app/go/route.ts     →  partner URL       (server-only, injects the marker)
 *
 * `/go` is the only place a partner hostname receives affiliate parameters, and
 * this builder is the only place a `/go` link is constructed. The CI assertion
 * in tests/partner-links.test.ts enforces both halves.
 *
 * SUB-ID SCHEME
 * -------------
 * Networks give a limited sub-ID payload, so it is encoded compactly and the
 * mapping is kept server-side:
 *
 *   sub_id  = <surface><product><alertType>   e.g. "emflmf" = email / flight / mistake-fare
 *   sub_id2 = <routeId base36>
 *   sub_id3 = <clickId>  → the affiliate_clicks row, holding userId, alertId,
 *                          verdict, confidence, price shown, timestamp
 *
 * Only the opaque click token leaves the building. User identifiers never enter
 * a third-party system, and new dimensions can be added to the click row later
 * without renegotiating the scheme with any network.
 */

import type { AffiliateSurface, AffiliateProvider } from './affiliate';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------
//
// Surfaces and partner brands are NOT redefined here. AFFILIATE_SURFACES and
// AFFILIATE_PROVIDERS in affiliate.ts are already the canonical lists — /go
// validates against them and the click rows are written in their terms. A
// second vocabulary would drift, and the drift would show up as untagged
// clicks nobody notices. This module only adds the two-character codes the
// sub-ID payload needs, and TypeScript forces the code map to stay exhaustive:
// adding a surface to AFFILIATE_SURFACES without giving it a code is a
// compile error, not a silently-untagged channel.

export type PartnerSurface = AffiliateSurface;
export type PartnerId = AffiliateProvider;

/** Two-character surface codes for sub_id. Exhaustive by construction. */
export const SURFACE_CODE: Record<AffiliateSurface, string> = {
  'dashboard-cheapest-card':        'dc',
  'dashboard-tracked-table':        'dt',
  'deals-table':                    'dl',
  'offers-page':                    'op',
  'hotels-grid':                    'hg',
  'heatmap':                        'hm',
  'nadia-concierge':                'cx',
  'email-alert':                    'em',
  'email-digest':                   'ed',
  'explore-page':                   'xp',
  'explore-map-panel':              'xm',
  'explore-slideshow':              'xs',
  'explore-destinations-slideshow': 'xd',
  'hotels-slideshow':               'hs',
  'airbnbs-slideshow':              'as',
  'rentals-page':                   'rp',
  'offers-results-table':           'ot',
  'search-form':                    'sf',
  'searches-tracked-table':         'st',
  'share-page':                     'sp',
  'mobile-app':                     'mb',
  'agent-social':                   'ag',
  'agent-email':                    'ae',
  'email-chain':                    'ec',
  'board-card':                     'bc',
  'board-watch':                    'bw',
};

/** What is being sold. This is the axis the trip chain monetizes along. */
export const PRODUCTS = {
  'flight':        'fl',
  'hotel':         'ht',
  'transfer':      'tr',
  'car':           'cr',
  'insurance':     'in',
  'esim':          'es',
  'tour':          'to',
  'compensation':  'cp',
} as const;
export type PartnerProduct = keyof typeof PRODUCTS;

/** What triggered the link, when it descends from an alert. */
export const ALERT_TYPES = {
  'threshold':     'th',
  'price-drop':    'pd',
  'mistake-fare':  'mf',
  'anomaly':       'an',
  'ready':         'rd',
  'digest':        'dg',
  'verdict-change':    'vc',
  'trend-warning':     'tw',
  'post-booking-drop': 'pb',
  'window-closing':    'wc',
  'none':          'xx',
} as const;
export type PartnerAlertType = keyof typeof ALERT_TYPES;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type PartnerLinkContext = {
  /** Which surface emitted the link. */
  surface: PartnerSurface;
  /** Canonical route identifier, e.g. "JFK_CAI_2026-07-07". Becomes sub_id2. */
  routeId?: string | null;
  /** The alerts_sent row this link descends from — the alert→click join. */
  alertId?: number | null;
  /** Alert type, for commission-per-alert-type reporting. */
  alertType?: PartnerAlertType;
  /** The user, when known. Stays server-side; never reaches the network. */
  userId?: number | null;
  /** The internal search this link prices. */
  searchId?: number | null;
  /** Buy/wait call shown alongside the price, and its confidence. */
  verdict?: 'buy' | 'wait' | 'hold' | null;
  confidencePct?: number | null;
  /** The price we showed. The delta against the price at landing is the metric
   *  that governs the product. */
  priceShownUsd?: number | null;
  /** Trip chain campaign that produced this send, when applicable. */
  campaign?: string | null;
  /** Trip this link belongs to, once the chain has opened one. */
  tripId?: string | null;
  /** Position of this option in a cross-shop list, and its display name —
   *  this is how we learn whether ordering by expected commission costs clicks. */
  optionRank?: number | null;
  optionName?: string | null;
};

export type BuildPartnerLinkInput = {
  partner: PartnerId;
  product: PartnerProduct;
  context: PartnerLinkContext;
  /** The partner destination URL (route, dates, pax, or hotel/city + dates).
   *  Omitted for brands reached by `/go?brand=` where the destination is
   *  resolved entirely server-side from env. */
  deeplink?: string | null;
  /** Absolute base, e.g. "https://my.flycheap.live". Omit for a root-relative link. */
  baseUrl?: string | null;
};

// ---------------------------------------------------------------------------
// Sub-ID encoding
// ---------------------------------------------------------------------------

/**
 * sub_id — six characters: surface, product, alert type.
 * Compact because networks truncate, and readable because we have to debug it
 * in someone else's dashboard at 2am.
 */
export function encodeSubId(
  surface: PartnerSurface,
  product: PartnerProduct,
  alertType: PartnerAlertType = 'none',
): string {
  return `${SURFACE_CODE[surface] ?? 'xx'}${PRODUCTS[product] ?? 'xx'}${ALERT_TYPES[alertType] ?? 'xx'}`;
}

/** Decode a sub_id back to its three parts. Returns null on anything malformed. */
export function decodeSubId(subId: string | null | undefined): {
  surface: PartnerSurface | null;
  product: PartnerProduct | null;
  alertType: PartnerAlertType | null;
} | null {
  if (!subId || subId.length !== 6) return null;
  const inv = <T extends Record<string, string>>(m: T, code: string) =>
    (Object.keys(m) as Array<keyof T>).find(k => m[k] === code) ?? null;
  return {
    surface: inv(SURFACE_CODE, subId.slice(0, 2)) as PartnerSurface | null,
    product: inv(PRODUCTS, subId.slice(2, 4)) as PartnerProduct | null,
    alertType: inv(ALERT_TYPES, subId.slice(4, 6)) as PartnerAlertType | null,
  };
}

/**
 * sub_id2 — route id in base36, to fit the payload.
 *
 * Route ids are not numeric, so this is a stable short hash of the string
 * rather than a numeric conversion. Collisions do not matter: the authoritative
 * route lives on the click row, and sub_id2 exists only so a network-side
 * breakdown by route is possible without a join.
 */
export function encodeRouteId(routeId: string | null | undefined): string | null {
  if (!routeId) return null;
  let h = 0;
  for (let i = 0; i < routeId.length; i++) {
    h = (Math.imul(31, h) + routeId.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

/**
 * Build the one and only kind of outbound partner link.
 *
 * Safe to call from client components: the returned URL contains no secrets and
 * no affiliate identifiers. `/go` attaches those server-side at redirect time.
 */
export function buildPartnerLink(input: BuildPartnerLinkInput): string {
  const { partner, product, context: c, deeplink } = input;
  const alertType: PartnerAlertType = c.alertType ?? (c.alertId ? 'threshold' : 'none');

  const qs = new URLSearchParams();

  // Brands whose destination must never come from the caller: the Travelpayouts
  // click hosts accept a custom_url parameter, which makes them open
  // redirectors. /go?brand= looks the whole link up in server env instead.
  if (!deeplink) {
    qs.set('brand', partner);
  } else {
    qs.set('to', deeplink);
    qs.set('provider', partner);
  }

  qs.set('surface', c.surface);
  qs.set('product', product);
  qs.set('sub_id', encodeSubId(c.surface, product, alertType));

  if (c.routeId) {
    qs.set('route_id', c.routeId);
    const sub2 = encodeRouteId(c.routeId);
    if (sub2) qs.set('sub_id2', sub2);
    // Route ids are "ORIG_DEST_YYYY-MM-DD" or "ORIG-DEST-YYYYMMDD-YYYYMMDD";
    // unpack whichever shape so /go can write real columns on the click row.
    for (const [k, v] of Object.entries(unpackRouteId(c.routeId))) {
      if (v) qs.set(k, v);
    }
  }

  if (c.alertId != null)       qs.set('alert_id', String(c.alertId));
  if (alertType !== 'none')    qs.set('alert_kind', alertType);
  if (c.searchId != null)      qs.set('search_id', String(c.searchId));
  if (c.priceShownUsd != null) qs.set('per', String(Math.round(c.priceShownUsd)));
  if (c.verdict)               qs.set('verdict', c.verdict);
  if (c.confidencePct != null) qs.set('confidence', String(Math.round(c.confidencePct)));
  if (c.campaign)              qs.set('campaign', c.campaign);
  if (c.tripId)                qs.set('trip_id', c.tripId);
  if (c.optionRank != null)    qs.set('rank', String(c.optionRank));
  if (c.optionName)            qs.set('option', c.optionName);

  const path = `/go?${qs.toString()}`;
  return input.baseUrl ? `${input.baseUrl.replace(/\/$/, '')}${path}` : path;
}

/** Pull origin/destination/dates out of either route-id shape we emit. */
export function unpackRouteId(routeId: string): {
  origin?: string; destination?: string; dep?: string; ret?: string;
} {
  const out: { origin?: string; destination?: string; dep?: string; ret?: string } = {};
  const parts = routeId.split(/[-_]/).filter(Boolean);
  if (parts[0] && /^[A-Z]{3}$/i.test(parts[0])) out.origin = parts[0].toUpperCase();
  if (parts[1] && /^[A-Z]{3}$/i.test(parts[1])) out.destination = parts[1].toUpperCase();
  const dates = routeId.match(/\d{4}-\d{2}-\d{2}|\d{8}/g) ?? [];
  const norm = (d: string) => (d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d);
  if (dates[0]) out.dep = norm(dates[0]);
  if (dates[1]) out.ret = norm(dates[1]);
  return out;
}

/** Canonical route id from its parts, so every surface spells it the same way. */
export function routeIdFor(opts: {
  origin: string; destination: string; departDate?: string | null; returnDate?: string | null;
}): string {
  return [opts.origin, opts.destination, opts.departDate, opts.returnDate]
    .filter(Boolean)
    .join('_')
    .replace(/[^A-Za-z0-9_-]/g, '_');
}

import { NextResponse, after } from 'next/server';
import crypto from 'node:crypto';
import { queries } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isBotUserAgent } from '@/lib/botDetect';
import {
  isValidSurface, isValidProvider,
  tpBrandLink, type TpBrand,
} from '@/lib/affiliate';
import { decodeSubId } from '@/lib/partnerLink';

export const dynamic = 'force-dynamic';

// Outbound affiliate redirect.
//
//   /go?to=https%3A%2F%2Faviasales.com%2F...&origin=JFK&destination=CAI&dep=2026-07-07&ret=2026-08-28&per=758&provider=travelpayouts&search_id=15
//
// Records the click to affiliate_clicks with a one-time token, then 302s to
// the destination. The token survives in the redirect URL as `?cf_click=…` so
// downstream postbacks can be matched back to the click.
// Allowlisted destination hosts for the /go redirect.
//
// SECURITY NOTE: This list excludes any host that runs its own open redirector
// (Google's /url?q=, CJ's tkqlhce/anrdoezrs/etc., Awin's awclick.php, Travel-
// payouts' tpk.lu short-link domain). Allowing those domains turns /go into
// a phishing-friendly chain: attacker crafts /go?to=https://google.com/url?q=evil
// and the user lands on evil.example with my.flycheap.live in the displayed
// URL. We allow them ONLY as the BAKED-IN destination of links we generate
// (e.g., tpk.lu links from our own affiliate.ts), never as user input.
//
// To add back a redirector host safely, switch to a path policy (allow tpk.lu
// only for paths matching /^[A-Za-z0-9]{8}$/ short-codes, etc.).
const ALLOW_HOSTS = new Set([
  // Travel partners (direct booking pages — no chain-redirect path)
  'aviasales.com', 'www.aviasales.com',
  'hotellook.com', 'www.hotellook.com', 'search.hotellook.com',
  'wayaway.io', 'www.wayaway.io',
  'skyscanner.com', 'www.skyscanner.com',
  'kayak.com', 'www.kayak.com',
  'expedia.com', 'www.expedia.com',
  'booking.com', 'www.booking.com',
  'momondo.com', 'www.momondo.com',
  'kiwi.com', 'www.kiwi.com',
  'trip.com', 'www.trip.com', 'm.trip.com', 'us.trip.com',
  // Stays: Airbnb + Vrbo prefilled searches (no affiliate program; clicks are still logged)
  'airbnb.com', 'www.airbnb.com',
  'vrbo.com', 'www.vrbo.com',
  // Direct airline — book.egyptair.com is the booking subdomain used in
  // crossShopLinks(); without it /go 400s the EgyptAir direct option.
  'egyptair.com', 'www.egyptair.com', 'book.egyptair.com',
  // Travelpayouts media (legitimate first-party domain, no open redirect)
  'tp.media', 'www.tp.media',
]);

// Path-restricted allowlist for hosts that DO run internal redirectors but
// where we still need to use them (e.g., tpk.lu short-link). Only specific
// path patterns are accepted to prevent chain-redirect abuse.
const ALLOW_HOSTS_PATH_RESTRICTED: Array<{ host: string; pathRegex: RegExp }> = [
  // Travelpayouts short links: /<8-char alphanumeric>
  { host: 'aviasales.tpk.lu', pathRegex: /^\/[A-Za-z0-9_-]{6,12}$/ },
  { host: 'tpk.lu',           pathRegex: /^\/[A-Za-z0-9_-]{6,12}$/ },
  // Google Flights — google.com runs an open redirector at /url?q=, so
  // ONLY accept the /travel/flights search path. Never accept bare /url.
  { host: 'google.com',       pathRegex: /^\/travel\/flights(\/|\?|$)/ },
  { host: 'www.google.com',   pathRegex: /^\/travel\/flights(\/|\?|$)/ },
];

/** Attach brands reachable via ?brand= instead of ?to=. */
const BRAND_PARAM: Record<string, TpBrand> = { ekta: 'ekta', kiwitaxi: 'kiwitaxi' };

/**
 * The attribution payload buildPartnerLink() put on this request.
 *
 * Everything here is written to the click_out row (affiliate_clicks) and stays
 * server-side. Only the opaque token goes to the network, as sub_id3.
 */
function readClickContext(url: URL) {
  const int = (k: string) => {
    const v = url.searchParams.get(k);
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const num = (k: string) => {
    const v = url.searchParams.get(k);
    if (!v) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const verdictRaw = url.searchParams.get('verdict');
  const alertId = int('alert_id');

  // Minutes since the alert fired. Derived from alerts_sent rather than trusted
  // from the URL, so it cannot be forged and so it stays correct when a link is
  // clicked out of an email days later.
  let minutesSinceAlert: number | null = null;
  if (alertId != null) {
    try {
      const row = queries.alertSentAt(alertId);
      if (row?.sent_at) {
        const t = Date.parse(row.sent_at.replace(' ', 'T') + (row.sent_at.endsWith('Z') ? '' : 'Z'));
        if (!Number.isNaN(t)) minutesSinceAlert = Math.max(0, Math.round((Date.now() - t) / 60000));
      }
    } catch { /* attribution detail is never worth failing a redirect over */ }
  }

  const subId = url.searchParams.get('sub_id');
  const decoded = decodeSubId(subId);

  return {
    alert_id: alertId,
    alert_kind: url.searchParams.get('alert_kind') ?? (decoded?.alertType === 'none' ? null : decoded?.alertType ?? null),
    product: url.searchParams.get('product') ?? decoded?.product ?? null,
    sub_id: subId,
    sub_id2: url.searchParams.get('sub_id2'),
    price_shown_usd: num('per'),
    verdict: verdictRaw === 'buy' || verdictRaw === 'wait' || verdictRaw === 'hold' ? verdictRaw : null,
    confidence_pct: int('confidence'),
    minutes_since_alert: minutesSinceAlert,
    option_rank: int('rank'),
    option_name: url.searchParams.get('option'),
  };
}

/**
 * Push the sub-ID payload onto whichever slots this network exposes.
 *
 * sub_id3 is always the click token and nothing else — the identifying detail
 * lives in our own click_out row. That keeps user identifiers out of third-party
 * systems and lets us add dimensions later without renegotiating the scheme.
 */
function applySubIds(
  target: URL,
  host: string,
  ctx: { sub_id: string | null; sub_id2: string | null },
  token: string,
): void {
  const set = (k: string, v: string | null) => {
    if (v && !target.searchParams.has(k)) target.searchParams.set(k, v);
  };
  if (host.endsWith('trip.com')) {
    set('trip_sub1', ctx.sub_id);
    set('trip_sub2', ctx.sub_id2);
    set('trip_sub3', token);
    return;
  }
  if (host === 'booking.com' || host === 'www.booking.com') {
    // Booking gives one free-text label; pack the scheme into it.
    set('label', [ctx.sub_id, ctx.sub_id2, token].filter(Boolean).join('-'));
    return;
  }
  if (host === 'expedia.com' || host === 'www.expedia.com') {
    set('clickref', [ctx.sub_id, ctx.sub_id2, token].filter(Boolean).join('-'));
    return;
  }
  if (host === 'skyscanner.com' || host === 'www.skyscanner.com') {
    set('subid', [ctx.sub_id, ctx.sub_id2, token].filter(Boolean).join('-'));
    return;
  }
  // Travelpayouts family carries its sub-ids as dotted suffixes on the marker,
  // which is attached further down once the marker itself is resolved.
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // ── Brand path ──────────────────────────────────────────────────────────
  // Travelpayouts click hosts accept a custom_url parameter, which makes them
  // open redirectors. So for these brands we never accept a destination from
  // the caller: /go?brand=ekta looks the whole link up in server env and
  // builds it here. Nothing user-supplied reaches the outbound URL.
  const brandParam = url.searchParams.get('brand');
  if (brandParam) {
    const brand = BRAND_PARAM[brandParam.toLowerCase()];
    if (!brand) return NextResponse.json({ error: `unknown brand: ${brandParam}` }, { status: 400 });

    const brandIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip') ?? 'unknown';
    if (!queries.rateLimitCheck('go', brandIp, 30, 60)) {
      return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429 });
    }

    const brandSurface = url.searchParams.get('surface');
    const brandRouteId = url.searchParams.get('route_id');
    const dest = tpBrandLink({
      brand,
      sub: [brandSurface, brandRouteId].filter(Boolean).join('_') || undefined,
    });
    // Not configured yet, or a malformed template: send the user to the site
    // rather than a dead link, and don't log a click that can never convert.
    if (!dest) {
      console.warn(`[/go] brand "${brand}" is not configured — no TP_LINK_ template`);
      // req.url carries the internal origin behind the proxy (localhost:3000),
      // so derive the public origin from the forwarded host instead.
      const publicHost = req.headers.get('x-forwarded-host')
        ?? req.headers.get('host') ?? 'flycheap.live';
      return NextResponse.redirect(`https://${publicHost}/`, 302);
    }

    const brandUser = await getCurrentUser();
    const { sub_id2: _brandSub2, ...brandCtx } = readClickContext(url);
    try {
      queries.insertAffiliateClick({
        ...brandCtx,
        token: crypto.randomBytes(12).toString('base64url'),
        user_id: brandUser?.id ?? null,
        search_id: null,
        origin: url.searchParams.get('origin'),
        destination: url.searchParams.get('destination'),
        depart_date: url.searchParams.get('dep'),
        return_date: url.searchParams.get('ret'),
        per_adult_usd: null,
        provider: brand,
        // Brand links are prebuilt TP click URLs from TP_LINK_* env templates,
        // so the marker is already inside `dest`. Read it back rather than
        // storing null and losing the attribution record.
        marker: (() => { try { return new URL(dest).searchParams.get('marker'); } catch { return null; } })(),
        ip: brandIp === 'unknown' ? brandIp
          : brandIp.includes(':') ? brandIp.split(':').slice(0, 3).join(':') + '::/48'
          : brandIp.split('.').length === 4 ? brandIp.split('.').slice(0, 3).join('.') + '.0/24'
          : brandIp,
        user_agent: req.headers.get('user-agent') ?? null,
        surface: brandSurface,
        route_id: brandRouteId,
      });
    } catch (e) {
      console.error('[/go] brand click insert failed', e);
    }

    const brandRes = NextResponse.redirect(dest, 302);
    brandRes.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return brandRes;
  }

  // ── Crawler short-circuit ───────────────────────────────────────────────
  // robots.txt disallows /go, but not every crawler obeys. A bot that reaches
  // here is sent to the clean destination with NO affiliate parameters and NO
  // click row: it never hits a partner under our marker, and never inflates
  // the revenue dashboard. See lib/botDetect.ts for the audit behind this.
  const isBot = isBotUserAgent(req.headers.get('user-agent'));

  const to = url.searchParams.get('to');
  if (!to) return NextResponse.json({ error: 'missing ?to= or ?brand=' }, { status: 400 });

  let target: URL;
  try { target = new URL(to); } catch { return NextResponse.json({ error: 'bad to URL' }, { status: 400 }); }
  if (target.protocol !== 'https:') return NextResponse.json({ error: 'https only' }, { status: 400 });
  // Normalize: lowercase + strip trailing dot for FQDN form
  const normalizedHost = target.hostname.toLowerCase().replace(/\.$/, '');
  const isFullyAllowed = ALLOW_HOSTS.has(normalizedHost);
  const pathRestricted = ALLOW_HOSTS_PATH_RESTRICTED.find(r => r.host === normalizedHost);
  const isPathAllowed = pathRestricted ? pathRestricted.pathRegex.test(target.pathname) : false;
  if (!isFullyAllowed && !isPathAllowed) {
    return NextResponse.json({ error: `host not allow-listed: ${target.hostname}` }, { status: 400 });
  }

  // Crawler: allow-listed destination, but stop here — clean redirect, no
  // affiliate params appended and no click row written.
  if (isBot) {
    const botRes = NextResponse.redirect(target.toString(), 302);
    botRes.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    botRes.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return botRes;
  }

  // Rate limit: 30 req/min per IP. Prevents click-injection attacks where
  // an attacker fabricates affiliate_clicks rows at high volume to pollute
  // revenue dashboards or burn through TP fraud thresholds.
  const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
  if (!queries.rateLimitCheck('go', rawIp, 30, 60)) {
    return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429 });
  }

  const user = await getCurrentUser();
  const token = crypto.randomBytes(12).toString('base64url');
  const searchIdRaw = url.searchParams.get('search_id');
  const perRaw = url.searchParams.get('per');

  // Safe integer parse: parseInt('abc') returns NaN; we want null in the DB.
  function safeInt(v: string | null): number | null {
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  function safeFloat(v: string | null): number | null {
    if (!v) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  // PII reduction: truncate IPv4 to /24, IPv6 to /48. Affiliate analytics
  // doesn't need exact IP; this keeps us GDPR/CCPA-friendlier without losing
  // the geo signal.
  function truncIp(ip: string): string {
    if (ip === 'unknown') return ip;
    if (ip.includes(':')) {
      // IPv6 — keep first 3 groups
      const parts = ip.split(':');
      return parts.slice(0, 3).join(':') + '::/48';
    }
    const oct = ip.split('.');
    return oct.length === 4 ? `${oct[0]}.${oct[1]}.${oct[2]}.0/24` : ip;
  }

  // Resolve the post-attribution marker. Priority:
  //   1. ?marker=... query param on this /go request
  //   2. fc_marker cookie (set by middleware when user landed with ?marker=)
  // The cookie path covers the realistic case: visitor arrives via a social
  // post (?marker=fc_yt_20260512), browses, then clicks Book later — the
  // marker is preserved across navigation by the cookie.
  const queryMarker = url.searchParams.get('marker');
  const cookieMarker = req.headers.get('cookie')?.match(/(?:^|;\s*)fc_marker=([A-Za-z0-9_-]{1,64})/)?.[1] ?? null;
  const postMarker = queryMarker || cookieMarker;

  // Validate provider/surface against the canonical lists. Unknowns still
  // get stored (forward-compat for new programs) but are logged so typos
  // surface in the prod logs before they pollute the revenue dashboard.
  const surfaceParam = url.searchParams.get('surface');
  const providerParam = url.searchParams.get('provider');
  if (surfaceParam && !isValidSurface(surfaceParam)) {
    console.warn(`[/go] unknown surface "${surfaceParam}" — recording anyway, but check the callsite`);
  }
  if (providerParam && !isValidProvider(providerParam)) {
    console.warn(`[/go] unknown provider "${providerParam}" — recording anyway, but check the callsite`);
  }

  // Which surface sent the user out, and for which route. Kept because it
  // answers "is the alert any good" — did the fare the alert quoted still look
  // right when they clicked it — which is a question about honesty, not
  // earnings. What used to ride alongside it (commission-per-alert-type,
  // alert-to-click-to-booking conversion) went with the monetisation.
  const clickCtx = readClickContext(url);
  const { sub_id2: _sub2, ...clickRow } = clickCtx;

  const originParamEarly = url.searchParams.get('origin');
  const destParamEarly = url.searchParams.get('destination');

  try {
    queries.insertAffiliateClick({
      ...clickRow,
      token,
      user_id: user?.id ?? null,
      search_id: safeInt(searchIdRaw),
      origin: url.searchParams.get('origin'),
      destination: url.searchParams.get('destination'),
      depart_date: url.searchParams.get('dep'),
      return_date: url.searchParams.get('ret'),
      per_adult_usd: safeFloat(perRaw),
      provider: providerParam,
      // No marker, because nothing is attributed to anyone any more. The column
      // stays so existing rows keep their history rather than being rewritten.
      marker: null,
      ip: truncIp(rawIp),
      user_agent: req.headers.get('user-agent') ?? null,
      surface: surfaceParam,
      route_id: url.searchParams.get('route_id'),
    });
  } catch (e) {
    // Don't break the redirect if the DB insert fails — log + continue.
    console.error('[/go] affiliate_clicks insert failed', e);
  }

  // ── Open the trip ────────────────────────────────────────────────────────
  // A Book click on a flight is a probable booking. Open a pending trip and
  // queue the soft confirmation — one email, 20-40 minutes later, asking whether
  // they got it. That answer is the only ground truth on conversion we will ever
  // have, and it is the gate on everything commercial: nothing in the chain
  // fires until the user says booked.
  if (user?.id && (clickCtx.product ?? 'flight') === 'flight' && originParamEarly && destParamEarly) {
    try {
      const { openTripFromClick } = await import('@/lib/tripChain');
      openTripFromClick({
        clickToken: token,
        userId: user.id,
        searchId: safeInt(searchIdRaw),
        origin: originParamEarly,
        destination: destParamEarly,
        departDate: url.searchParams.get('dep'),
        returnDate: url.searchParams.get('ret'),
        farePerAdultUsd: clickCtx.price_shown_usd,
      });
    } catch (e) {
      // Never break a booking click over follow-up bookkeeping.
      console.error('[/go] openTripFromClick failed', (e as Error).message);
    }
  }

  // ── Measure the delta ────────────────────────────────────────────────────
  // "price shown at alert vs price at landing" is the metric that governs the
  // product. We cannot see the landing price, but we CAN re-query at click time
  // and record it against the click.
  //
  // Runs in after(), so it never delays the user's redirect — the whole value of
  // a fare alert is that the click is instant. A failure here is logged and
  // dropped: the click row simply has no price_at_click, which the trust
  // dashboard treats as absent evidence rather than a zero delta.
  const originParam = originParamEarly;
  const destParam = destParamEarly;
  const depParam = url.searchParams.get('dep');
  const retParam = url.searchParams.get('ret');
  if (clickCtx.price_shown_usd != null && originParam && destParam && depParam && retParam) {
    after(async () => {
      try {
        const { searchFlights } = await import('@/lib/flightProvider');
        const res = await searchFlights({
          origin: originParam, destination: destParam,
          departDate: depParam, returnDate: retParam,
          adults: 1, infants: 0,
        }, { searchId: safeInt(searchIdRaw), phase: 'click' });
        const cheapest = res.ok ? res.offers[0] : null;
        if (cheapest) queries.setClickPriceAtClick(token, cheapest.per_adult_usd);
      } catch (e) {
        console.error('[/go] click-time re-query failed', (e as Error).message);
      }
    });
  }

  // ---------------------------------------------------------------------
  // No monetisation. This used to be the money: a Travelpayouts marker with a
  // dotted sub-id chain, Trip.com's Allianceid, Booking's aid, Expedia's
  // siteid, Skyscanner's associateid, per-network sub-id slots, a cf_click
  // correlation token and a CJ wrapper around the lot — all injected
  // server-side because the client bundle cannot see the env vars.
  //
  // FlyCheap earns nothing now, by decision rather than by accident, so every
  // one of those is gone and the user is sent to the destination they asked
  // for, unmodified. What survives is the part that was never about money:
  //
  //   the host allowlist, because an open redirector is an open redirector
  //   whether or not anyone is paid for it;
  //   the bot guard, so crawlers do not generate click rows;
  //   and `strict-origin-when-cross-origin`, which sends our origin and never
  //   the path or query.
  //
  // Nothing is appended to the URL at all, which is also why there is no
  // longer a token to leak.
  // ---------------------------------------------------------------------
  const finalUrl = target.toString();

  const res = NextResponse.redirect(finalUrl, 302);
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
}

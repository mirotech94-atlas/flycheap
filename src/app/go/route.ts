import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { queries } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isBotUserAgent } from '@/lib/botDetect';
import {
  isValidSurface, isValidProvider,
  cjProviderForHost, cjTemplateFor, cjWrap,
  tpBrandLink, type TpBrand,
} from '@/lib/affiliate';

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
// and the user lands on evil.example with flycheap.18dn.com in the displayed
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
    try {
      queries.insertAffiliateClick({
        token: crypto.randomBytes(12).toString('base64url'),
        user_id: brandUser?.id ?? null,
        search_id: null,
        origin: url.searchParams.get('origin'),
        destination: url.searchParams.get('destination'),
        depart_date: url.searchParams.get('dep'),
        return_date: url.searchParams.get('ret'),
        per_adult_usd: null,
        provider: brand,
        marker: null,
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

  try {
    queries.insertAffiliateClick({
      token,
      user_id: user?.id ?? null,
      search_id: safeInt(searchIdRaw),
      origin: url.searchParams.get('origin'),
      destination: url.searchParams.get('destination'),
      depart_date: url.searchParams.get('dep'),
      return_date: url.searchParams.get('ret'),
      per_adult_usd: safeFloat(perRaw),
      provider: providerParam,
      marker: postMarker,
      ip: truncIp(rawIp),
      user_agent: req.headers.get('user-agent') ?? null,
      surface: surfaceParam,
      route_id: url.searchParams.get('route_id'),
    });
  } catch (e) {
    // Don't break the redirect if the DB insert fails — log + continue.
    console.error('[/go] affiliate_clicks insert failed', e);
  }

  // Append click token so partner-side postbacks can correlate later.
  target.searchParams.set('cf_click', token);

  // ---------------------------------------------------------------------
  // Server-side affiliate-param injection.
  // CRITICAL: env vars must be applied here (server) because the URL
  // builders may run in client-bundled code (BookButton.tsx is 'use client').
  // process.env.X is undefined in the browser bundle for non-NEXT_PUBLIC_
  // vars — so client-built URLs ship WITHOUT affiliate params.
  // Adding marker/Allianceid/associateid here recovers attribution.
  // ---------------------------------------------------------------------

  const host = target.hostname.toLowerCase().replace(/\.$/, '');

  // CJ routing decision, made BEFORE the direct-program injections below.
  // If an advertiser is running through CJ, its direct query-param program
  // (Booking's ?aid=, Expedia's ?siteid=) must NOT also be applied — the two
  // are competing attribution paths and stacking them attributes to neither.
  const cjProvider = cjProviderForHost(host);
  const cjTemplate = cjProvider ? cjTemplateFor(cjProvider) : null;

  // Travelpayouts marker — applies to aviasales.com, hotellook.com,
  // wayaway.io, tpk.lu (all share marker pool). When a per-post social
  // marker rode along (cookie or query), it becomes the sub-id.
  const tpMarker = process.env.AVIASALES_MARKER || process.env.TRAVELPAYOUTS_MARKER;
  const tpHosts = [
    'aviasales.com', 'www.aviasales.com',
    'hotellook.com', 'www.hotellook.com', 'search.hotellook.com',
    'wayaway.io', 'www.wayaway.io',
    'aviasales.tpk.lu', 'tpk.lu', 'www.tpk.lu',
  ];
  if (tpMarker && tpHosts.includes(host) && !target.searchParams.has('marker')) {
    const finalMarker = postMarker ? `${tpMarker}.${postMarker}` : tpMarker;
    target.searchParams.set('marker', finalMarker);
  }

  // Trip.com — Allianceid is the affiliate identifier; SID is sub-id.
  if (host.endsWith('trip.com')) {
    const allianceId = process.env.TRIPCOM_ALLIANCE_ID;
    const sid = process.env.TRIPCOM_SID;
    if (allianceId && !target.searchParams.has('Allianceid')) {
      target.searchParams.set('Allianceid', allianceId);
    }
    if (sid && !target.searchParams.has('SID')) {
      target.searchParams.set('SID', sid);
    }
    // Trip.com sub-id slots — populate from our /go query if not already set.
    const surface = url.searchParams.get('surface');
    const routeIdParam = url.searchParams.get('route_id');
    if (surface && !target.searchParams.has('trip_sub1')) {
      target.searchParams.set('trip_sub1', surface);
    }
    if (routeIdParam && !target.searchParams.has('trip_sub3')) {
      target.searchParams.set('trip_sub3', routeIdParam);
    }
  }

  // Booking.com — aid is the affiliate identifier; label is the sub-tracker.
  // Read both BOOKING_AID (server-side admin convention) and the public
  // NEXT_PUBLIC_BOOKING_AID (so a single value in either slot works).
  if (!cjTemplate && (host === 'booking.com' || host === 'www.booking.com')) {
    const aid = process.env.BOOKING_AID || process.env.NEXT_PUBLIC_BOOKING_AID;
    if (aid && !target.searchParams.has('aid')) {
      target.searchParams.set('aid', aid);
      const surface = url.searchParams.get('surface');
      const routeIdParam = url.searchParams.get('route_id');
      const label = [surface, routeIdParam].filter(Boolean).join('.') || 'hotels-grid';
      if (!target.searchParams.has('label')) target.searchParams.set('label', label);
    }
  }

  // Expedia — siteid is the affiliate identifier; clickref is the sub-tracker.
  if (!cjTemplate && (host === 'expedia.com' || host === 'www.expedia.com')) {
    const siteid = process.env.EXPEDIA_SITEID || process.env.NEXT_PUBLIC_EXPEDIA_SITEID;
    if (siteid && !target.searchParams.has('siteid')) {
      target.searchParams.set('siteid', siteid);
      const surface = url.searchParams.get('surface');
      const routeIdParam = url.searchParams.get('route_id');
      const clickref = [surface, routeIdParam].filter(Boolean).join('.') || 'hotels-grid';
      if (!target.searchParams.has('clickref')) target.searchParams.set('clickref', clickref);
    }
  }

  // Skyscanner — associateid is the affiliate identifier.
  if (host === 'skyscanner.com' || host === 'www.skyscanner.com') {
    const associateId = process.env.SKYSCANNER_ASSOCIATE_ID;
    if (associateId && !target.searchParams.has('associateid')) {
      target.searchParams.set('associateid', associateId);
      const surface = url.searchParams.get('surface');
      const routeIdParam = url.searchParams.get('route_id');
      if (surface || routeIdParam) {
        const subid = [surface, routeIdParam].filter(Boolean).join('.');
        target.searchParams.set('subid', subid);
      }
    }
  }

  // Referrer policy: send only the ORIGIN (https://flycheap.18dn.com) as the
  // Referer header — no path, no query — so the cf_click token and affiliate
  // params can never leak to third-party trackers on the partner's landing
  // page. But the partner DOES see our domain, which is required by some
  // affiliate fraud filters (notably Trip.com) to attribute clicks. The
  // previous policy `no-referrer` stripped the header entirely, which caused
  // Trip.com's dashboard to report 0 clicks despite our DB logging 11+ — their
  // fraud system drops traffic that arrives with no referrer.
  // CJ wrap — last step, so the encoded destination carries cf_click and
  // every param set above. cjWrap returns null on a missing/malformed
  // template, in which case we redirect direct and simply earn nothing,
  // rather than breaking the user's click.
  let finalUrl = target.toString();
  if (cjTemplate) {
    const sid = [url.searchParams.get('surface'), url.searchParams.get('route_id')]
      .filter(Boolean).join('.') || token;
    const wrapped = cjWrap({ template: cjTemplate, destination: finalUrl, sid });
    if (wrapped) finalUrl = wrapped;
    else console.warn(`[/go] CJ template for "${cjProvider}" is malformed — redirecting unattributed`);
  }

  const res = NextResponse.redirect(finalUrl, 302);
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
}

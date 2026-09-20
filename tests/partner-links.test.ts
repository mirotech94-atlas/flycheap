import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPartnerLink, encodeSubId, decodeSubId, encodeRouteId,
  routeIdFor, unpackRouteId, SURFACE_CODE,
} from '@/lib/partnerLink';
import { AFFILIATE_SURFACES, productForHost } from '@/lib/affiliate';

const SRC = path.join(process.cwd(), 'src');

describe('sub-ID scheme', () => {
  it('encodes surface / product / alert type into six characters', () => {
    // The spec's worked example: email / flight / mistake-fare.
    expect(encodeSubId('email-alert', 'flight', 'mistake-fare')).toBe('emflmf');
    expect(encodeSubId('email-alert', 'flight', 'mistake-fare')).toHaveLength(6);
  });

  it('round-trips every surface', () => {
    for (const surface of AFFILIATE_SURFACES) {
      const sub = encodeSubId(surface, 'hotel', 'price-drop');
      expect(decodeSubId(sub)).toEqual({
        surface, product: 'hotel', alertType: 'price-drop',
      });
    }
  });

  it('gives every canonical surface a distinct code', () => {
    // Two surfaces sharing a code would silently merge two channels in every
    // network-side report, and the decode above would return the wrong one.
    const codes = Object.values(SURFACE_CODE);
    expect(new Set(codes).size).toBe(codes.length);
    for (const surface of AFFILIATE_SURFACES) {
      expect(SURFACE_CODE[surface]).toMatch(/^[a-z]{2}$/);
    }
  });

  it('rejects malformed sub-ids rather than guessing', () => {
    expect(decodeSubId(null)).toBeNull();
    expect(decodeSubId('')).toBeNull();
    expect(decodeSubId('emfl')).toBeNull();
    expect(decodeSubId('emflmfxx')).toBeNull();
  });

  it('encodes a route id compactly and stably', () => {
    const a = encodeRouteId('JFK_CAI_2026-07-07');
    expect(a).toBe(encodeRouteId('JFK_CAI_2026-07-07'));
    expect(a).not.toBe(encodeRouteId('JFK_BCN_2026-07-07'));
    expect(a!.length).toBeLessThanOrEqual(7);
  });
});

describe('route ids', () => {
  it('round-trips through unpack', () => {
    const id = routeIdFor({ origin: 'JFK', destination: 'BCN', departDate: '2026-07-07', returnDate: '2026-07-15' });
    expect(unpackRouteId(id)).toEqual({
      origin: 'JFK', destination: 'BCN', dep: '2026-07-07', ret: '2026-07-15',
    });
  });

  it('reads the legacy compact date form too', () => {
    expect(unpackRouteId('JFK-CAI-20260707-20260715')).toEqual({
      origin: 'JFK', destination: 'CAI', dep: '2026-07-07', ret: '2026-07-15',
    });
  });
});

describe('productForHost', () => {
  it('discriminates multi-category hosts on path, not host', () => {
    // trip.com sells flights and hotels from one domain. Keying on the host
    // alone filed every Trip.com flight click under hotels — invisible until
    // the product breakdown is already being read.
    expect(productForHost('https://www.trip.com/flights/showfarefirst?a=1')).toBe('flight');
    expect(productForHost('https://www.trip.com/hotels/list?city=1')).toBe('hotel');
  });

  it('maps the single-category brands correctly', () => {
    expect(productForHost('https://www.booking.com/searchresults.html')).toBe('hotel');
    expect(productForHost('https://www.airbnb.com/s/Barcelona/homes')).toBe('hotel');
    expect(productForHost('https://www.aviasales.com/search/JFK0707BCN1')).toBe('flight');
  });

  it('falls back to flight rather than throwing on a malformed URL', () => {
    expect(productForHost('not a url')).toBe('flight');
  });
});

describe('buildPartnerLink', () => {
  const deeplink = 'https://www.aviasales.com/search/JFK0707BCN15071';

  it('always emits a /go link, never a bare partner URL', () => {
    const url = buildPartnerLink({
      partner: 'aviasales', product: 'flight', deeplink,
      context: { surface: 'email-alert' },
    });
    expect(url.startsWith('/go?')).toBe(true);
    expect(url).not.toMatch(/^https:\/\/www\.aviasales\.com/);
  });

  it('carries the full attribution context', () => {
    const url = buildPartnerLink({
      partner: 'aviasales', product: 'flight', deeplink,
      baseUrl: 'https://my.flycheap.live',
      context: {
        surface: 'email-alert',
        routeId: routeIdFor({ origin: 'JFK', destination: 'BCN', departDate: '2026-07-07' }),
        alertId: 4210, alertType: 'mistake-fare',
        searchId: 15, verdict: 'buy', confidencePct: 82, priceShownUsd: 484,
        optionRank: 2, optionName: 'Kayak',
      },
    });
    const q = new URL(url).searchParams;
    expect(q.get('sub_id')).toBe('emflmf');
    expect(q.get('alert_id')).toBe('4210');
    expect(q.get('alert_kind')).toBe('mistake-fare');
    expect(q.get('search_id')).toBe('15');
    expect(q.get('per')).toBe('484');
    expect(q.get('verdict')).toBe('buy');
    expect(q.get('confidence')).toBe('82');
    expect(q.get('rank')).toBe('2');
    expect(q.get('option')).toBe('Kayak');
    expect(q.get('provider')).toBe('aviasales');
    // Route parts unpacked so /go can write real columns on the click row.
    expect(q.get('origin')).toBe('JFK');
    expect(q.get('destination')).toBe('BCN');
    expect(q.get('dep')).toBe('2026-07-07');
  });

  it('never puts a user identifier in the outbound payload', () => {
    // The whole point of the scheme: identifying detail stays in our click row,
    // only the opaque token reaches the network.
    const url = buildPartnerLink({
      partner: 'aviasales', product: 'flight', deeplink,
      context: { surface: 'email-alert', userId: 99, alertId: 1 },
    });
    expect(url).not.toContain('99');
    expect(url).not.toContain('user');
  });

  it('resolves brand-only partners server-side (no caller-supplied destination)', () => {
    // Travelpayouts click hosts accept a custom_url parameter, which makes them
    // open redirectors — so for these the destination must never come from us.
    const url = buildPartnerLink({
      partner: 'ekta', product: 'insurance',
      context: { surface: 'email-alert', routeId: 'JFK_BCN_2026-07-07' },
    });
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('brand')).toBe('ekta');
    expect(q.get('to')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The guard the spec asks for:
//   "no partner hostname may appear in the codebase outside the builder"
// ---------------------------------------------------------------------------
//
// Adapted to this codebase's shape. /go is the server-side injector and is the
// only place a partner hostname receives affiliate parameters; buildPartnerLink
// is the only place a /go link is constructed. Between them sit a small number
// of files that legitimately spell a partner hostname, each listed below WITH
// ITS REASON. Anything else that starts writing partner URLs fails this test —
// which is the guard that stops the marker bug recurring in a channel nobody
// thought about.

const PARTNER_HOSTS = [
  'aviasales.com', 'hotellook.com', 'wayaway.io', 'booking.com', 'expedia.com',
  'skyscanner.com', 'kayak.com', 'momondo.com', 'trip.com', 'kiwi.com',
  'airbnb.com', 'vrbo.com', 'egyptair.com', 'tpk.lu',
];

const ALLOWED: Record<string, string> = {
  'lib/partnerLink.ts':   'the builder itself (hostnames appear only in docs)',
  'lib/affiliate.ts':     'deeplink shapes + the /go wrapper; consumed by the builder',
  'app/go/route.ts':      'the server-side injector — the one place markers are attached',
  'lib/utils.ts':         'crossShopLinks deeplink shapes, wrapped by /go at the call site',
  'lib/bookUrl.ts':       'mobile-app deeplink shape; returns a /go URL',
  'lib/explore.ts':       'deeplink shapes for the explore grid, wrapped by /go',
  'lib/bestDeals.ts':     'deeplink shapes for cached best deals, wrapped by /go',
  'lib/chatTools.ts':     'concierge deeplink shapes, wrapped by /go',
  'lib/hotelMockData.ts': 'fixture data for the hotels grid; never emitted as a live link',
  'lib/email.ts':         'alert email; builds via affiliate.ts helpers + /go',
  'lib/db.ts':            'AFFILIATE_PROVIDERS-adjacent comments and stored URLs',
  'components/HotelsGrid.tsx':        'hotel deeplink shapes, wrapped by /go',
  'components/HotelsSearchPanel.tsx': 'hotel deeplink shapes, wrapped by /go',
  'components/HotelUpsell.tsx':       'hotel deeplink shapes, wrapped by /go',
  'components/BookButton.tsx':        'renders crossShopLinks output; no hostname of its own',
  'components/BestDealsCard.tsx':     'renders bestDeals output',
  'components/FlightSearchForm.tsx':  'renders crossShopLinks output',
  'components/DraggableSearchList.tsx': 'renders crossShopLinks output',
  'components/StayHeroSlide.tsx':     'renders hotel deeplink output',
  'components/ProviderSettings.tsx':  'provider API docs links (admin UI prose)',
  'lib/providers/travelpayouts.ts':   'provider DATA api endpoint, not an outbound partner link',
  'lib/providers/kiwi.ts':            'provider DATA api endpoint, not an outbound partner link',
  'app/about/page.tsx':               'affiliate disclosure prose',
  'app/privacy/page.tsx':             'affiliate disclosure prose',
  'app/page.tsx':                     'marketing prose',
  'app/explore/page.tsx':             'renders explore deeplink output',
  'app/share-handler/page.tsx':       'parses INBOUND shared partner URLs; emits none',
  'app/admin/integrations/page.tsx':  'admin console: partner dashboard links',
  'app/admin/revenue/page.tsx':       'admin console: partner dashboard links',
  'app/api/v1/offers/route.ts':       'API response builds via /go helpers',
  'app/api/v1/fares/route.ts':        'API response builds via /go helpers',
  'app/api/v1/hotels/route.ts':       'API response builds via /go helpers',
  'app/api/offers/coverage/route.ts': 'provider coverage probe',
  'app/api/hotels/by-month/route.ts': 'hotel deeplink shapes, wrapped by /go',
  'agents/revenue/index.ts':          'reads partner revenue reports',
  'agents/social-poster/index.ts':    'emits via buildPartnerLink',
  'agents/email-digest/index.ts':     'emits via buildPartnerLink',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The hostname guard alone was not enough.
 *
 * BookButton.tsx hand-rolled its own `/go?...` query. It named no partner
 * hostname — those came from crossShopLinks — so the containment test above
 * passed while the product's MAIN conversion surface emitted links with no
 * sub_id, no product and no position. Every Book-panel click was invisible to
 * the funnel's segments.
 *
 * So: nothing outside the builder may construct a /go URL either.
 */
const GO_BUILDERS_ALLOWED = new Set([
  'lib/partnerLink.ts',  // the builder
  'lib/affiliate.ts',    // trackedRedirect/bookingLink adapters over it
  'app/go/route.ts',     // the route itself
]);

describe('/go construction containment', () => {
  it('no file outside the builder hand-rolls a /go URL', () => {
    // Matches `/go?` in a template literal or string, which is how every
    // hand-rolled version has looked. Comments are stripped first, so a file
    // may still DESCRIBE the pattern (several explain why they stopped using
    // it) without failing the guard.
    const rx = /['"`]\/go\?|`\$\{[^}]*\}\/go\?/;
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const offenders = walk(SRC)
      .map(f => path.relative(SRC, f))
      .filter(rel => !GO_BUILDERS_ALLOWED.has(rel))
      .filter(rel => rx.test(stripComments(fs.readFileSync(path.join(SRC, rel), 'utf8'))));

    expect(offenders, [
      'These files build a /go URL without going through buildPartnerLink().',
      'A link built by hand carries no sub_id, no product and no position, so',
      'its clicks vanish from every segment in the funnel.',
    ].join('\n')).toEqual([]);
  });

  it('the Book panel records which option was taken and where it ranked', () => {
    // The spec's reason for recording this: it is how you learn whether
    // ordering by expected commission costs you clicks.
    const src = fs.readFileSync(path.join(SRC, 'components/BookButton.tsx'), 'utf8');
    expect(src).toContain('optionRank');
    expect(src).toContain('optionName');
    expect(src).toContain('buildPartnerLink');
  });
});

describe('partner hostname containment', () => {
  it('no new file writes partner URLs outside the audited path', () => {
    const rx = new RegExp(PARTNER_HOSTS.map(h => h.replace(/\./g, '\\.')).join('|'));
    const offenders = walk(SRC)
      .map(f => path.relative(SRC, f))
      .filter(rel => !ALLOWED[rel])
      .filter(rel => rx.test(fs.readFileSync(path.join(SRC, rel), 'utf8')));

    expect(offenders, [
      'These files name a partner hostname but are not on the audited list.',
      'Emit the link through buildPartnerLink() in src/lib/partnerLink.ts, or',
      'add the file to ALLOWED in this test WITH the reason it is legitimate.',
    ].join('\n')).toEqual([]);
  });

  it('every allowlist entry still exists', () => {
    // A stale entry is a hole in the guard: the file it excused is gone, but the
    // exemption would silently cover a new file created at the same path.
    const missing = Object.keys(ALLOWED).filter(rel => !fs.existsSync(path.join(SRC, rel)));
    expect(missing).toEqual([]);
  });
});

/**
 * The spec's audit: "The multilingual builds are the likeliest place for a
 * stale template to be hiding."
 *
 * Audited 2026-09-20 across all eight language files: they contain copy only —
 * no partner hostnames, no /go construction, no link building of any kind. The
 * risk the spec predicted does not exist here because link building is
 * centralised. This test keeps it that way: the day someone puts a URL in a
 * translation file, it fails.
 */
describe('the multilingual builds emit no links of their own', () => {
  const I18N = path.join(SRC, 'lib/i18n');

  it('has language files to check', () => {
    const files = fs.readdirSync(I18N).filter(f => /^app\.[a-z]{2}\.ts$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(7);
  });

  it('contains no partner hostname and no hand-rolled /go in any language', () => {
    const hostRx = new RegExp(PARTNER_HOSTS.map(h => h.replace(/\./g, '\\.')).join('|'));
    const goRx = /['"`]\/go\?/;
    const offenders: string[] = [];
    for (const f of fs.readdirSync(I18N)) {
      if (!f.endsWith('.ts') && !f.endsWith('.tsx')) continue;
      const src = fs.readFileSync(path.join(I18N, f), 'utf8');
      if (hostRx.test(src) || goRx.test(src)) offenders.push(f);
    }
    expect(offenders, [
      'A translation file is building an outbound link.',
      'Localized copy must stay copy — every link comes from buildPartnerLink(),',
      'or one language quietly ships unattributed while the others do not.',
    ].join('\n')).toEqual([]);
  });
});

import 'server-only';

/**
 * Build the canonical `/go` affiliate booking URL for a flight fare.
 *
 * REVENUE INTEGRITY: the mobile app must NEVER construct Aviasales/Travelpayouts
 * URLs itself. It always opens this `/go?...` link, and the Travelpayouts `marker`
 * is injected server-side by the /go route (from AVIASALES_MARKER env) at redirect
 * time. This keeps a single source of truth for affiliate attribution.
 */
export function buildFareBookUrl(opts: {
  origin: string;
  destination: string;
  dep: string; // YYYY-MM-DD
  ret: string; // YYYY-MM-DD
  adults: number;
  perAdultUsd?: number | null;
  searchId?: number | null;
  baseUrl: string;
}): string {
  const ddmm = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${d}${m}`;
  };
  // Aviasales deeplink format (mirrors src/lib/utils.ts crossShop links).
  const aviasales =
    `https://www.aviasales.com/search/` +
    `${opts.origin}${ddmm(opts.dep)}${opts.destination}${ddmm(opts.ret)}${opts.adults}?currency=usd`;

  const qs = new URLSearchParams({
    to: aviasales,
    provider: 'aviasales',
    surface: 'mobile-app',
    origin: opts.origin,
    destination: opts.destination,
    dep: opts.dep,
    ret: opts.ret,
  });
  if (opts.perAdultUsd != null) qs.set('per', String(Math.round(opts.perAdultUsd)));
  if (opts.searchId != null) qs.set('search_id', String(opts.searchId));

  return `${opts.baseUrl.replace(/\/$/, '')}/go?${qs.toString()}`;
}

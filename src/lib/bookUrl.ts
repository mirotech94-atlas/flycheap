import 'server-only';
import { buildPartnerLink, routeIdFor } from './partnerLink';
import { aviasalesSearchLink } from './affiliate';

/**
 * Build the canonical `/go` booking URL for a flight fare.
 *
 * Everything still goes through `/go` rather than linking out directly, but the
 * reason changed. It used to be revenue integrity — the marker was injected
 * server-side so a client-built URL could not ship unattributed. Nothing is
 * attributed now; what `/go` still provides is one place that checks the
 * destination against the host allowlist and one place that records the
 * click-out, so "did the alert's fare survive the click" stays answerable.
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
  return buildPartnerLink({
    partner: 'aviasales',
    product: 'flight',
    baseUrl: opts.baseUrl,
    deeplink: aviasalesSearchLink({
      origin: opts.origin, destination: opts.destination,
      departDate: opts.dep, returnDate: opts.ret, adults: opts.adults,
    }),
    context: {
      surface: 'mobile-app',
      routeId: routeIdFor({
        origin: opts.origin, destination: opts.destination,
        departDate: opts.dep, returnDate: opts.ret,
      }),
      searchId: opts.searchId ?? null,
      priceShownUsd: opts.perAdultUsd ?? null,
    },
  });
}

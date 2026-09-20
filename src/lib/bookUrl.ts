import 'server-only';
import { buildPartnerLink, routeIdFor } from './partnerLink';
import { aviasalesSearchLink } from './affiliate';

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

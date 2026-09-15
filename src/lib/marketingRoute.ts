/**
 * Pure routing logic for the marketing-site cutover (bare domain / www serves
 * the public marketing site, everything else redirects to the client portal
 * host). No Next imports so this can be unit tested without the Edge runtime
 * and reused verbatim from middleware.
 */

export const MARKETING_PREFIXES = [
  '/welcome', '/pricing', '/about', '/guides', '/destinations', '/routes',
  '/contact', '/privacy', '/terms', '/trial-terms', '/demo', '/status',
  '/early-access', '/integrations', '/share', '/m',
];

export type MarketingDecision =
  | { kind: 'canonical-redirect'; host: string }
  | { kind: 'rewrite'; pathname: '/welcome' }
  | { kind: 'pass' }
  | { kind: 'app-redirect'; host: string }
  | { kind: 'none' };

export function marketingDecision(
  host: string,
  pathname: string,
  opts: { marketingHost: string; clientHost: string },
): MarketingDecision {
  const h = (host ?? '').toLowerCase().split(':')[0];
  const marketingHost = opts.marketingHost;

  if (!marketingHost || (h !== marketingHost && h !== `www.${marketingHost}`)) {
    return { kind: 'none' };
  }

  if (h === `www.${marketingHost}`) {
    return { kind: 'canonical-redirect', host: marketingHost };
  }

  if (pathname === '/') {
    return { kind: 'rewrite', pathname: '/welcome' };
  }

  const isMarketingPath = MARKETING_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isMarketingPath) {
    return { kind: 'pass' };
  }

  return { kind: 'app-redirect', host: opts.clientHost };
}

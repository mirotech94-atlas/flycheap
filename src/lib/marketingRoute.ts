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
  | { kind: 'rewrite'; pathname: string }
  | { kind: 'root-redirect' }
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

  // The standalone /welcome landing is retired — the early-access page is the
  // single marketing front door. Bounce /welcome (and sub-paths) to the root.
  if (pathname === '/welcome' || pathname.startsWith('/welcome/')) {
    return { kind: 'root-redirect' };
  }

  // The apex serves the early-access page (the one and only front end).
  if (pathname === '/') {
    return { kind: 'rewrite', pathname: '/early-access' };
  }

  const isMarketingPath = MARKETING_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isMarketingPath) {
    return { kind: 'pass' };
  }

  return { kind: 'app-redirect', host: opts.clientHost };
}

/**
 * On the client host, `/welcome` (and `/welcome/*`) duplicates the marketing
 * site's own landing — with a marketing host configured that content lives
 * there, not here. Bounce those requests back to the marketing site's root
 * (or the matching sub-path) instead of rendering it twice.
 *
 * Returns the target pathname on the marketing host, or null when there's
 * nothing to do (feature off, already on the marketing host / its www, a
 * custom domain not in `ourHosts`, or the path isn't /welcome).
 */
export function welcomeRedirect(
  host: string,
  pathname: string,
  opts: { marketingHost: string; ourHosts: ReadonlySet<string> },
): string | null {
  const h = (host ?? '').toLowerCase().split(':')[0];
  const marketingHost = opts.marketingHost;
  if (!marketingHost) return null;
  if (h === marketingHost || h === `www.${marketingHost}`) return null;
  if (!opts.ourHosts.has(h)) return null;
  if (pathname === '/welcome') return '/';
  if (pathname.startsWith('/welcome/')) return pathname.slice('/welcome'.length);
  return null;
}

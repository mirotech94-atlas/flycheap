import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_HOST, ADMIN_HOSTS, CLIENT_HOST, MARKETING_HOST, OUR_HOSTS } from '@/lib/hosts';
import { marketingDecision, welcomeRedirect } from '@/lib/marketingRoute';

// Hardcoded here (rather than imported from @/lib/auth) so middleware can run
// in the Edge runtime without pulling in the better-sqlite3 / Node-only deps.
// Keep in sync with SESSION_COOKIE in src/lib/auth.ts.
const SESSION_COOKIE = 'fareintel_session';

// Routes the middleware will redirect to /login when no session cookie is present.
// Everything else (welcome, login, share/[token], explore, all /api routes) is public —
// auth-sensitive APIs do their own check inside the route handler.
const PROTECTED_PREFIXES = ['/searches', '/settings', '/onboarding'];

// Admin subdomain host. Requests to https://admin.flycheap.18dn.com/<path>
// are rewritten internally to /admin/<path> so the admin portal can live on
// its own subdomain while sharing the same Next app. The /admin layout still
// runs its own isAdmin() check, so this rewrite is safe.
// ADMIN_HOSTS / CLIENT_HOST now come from @/lib/hosts so a cutover is an env change.
/** First path segment of every real /admin/<segment> route, plus the index. */
const ADMIN_SEGMENTS = new Set([
  'affiliate', 'clicks', 'errors', 'health', 'integrations',
  'queue', 'revenue', 'settings', 'signups', 'users',
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = (req.headers.get('host') ?? '').toLowerCase();

  // 308 redirect for the legacy /landing route — content moved to /welcome.
  if (pathname === '/landing' || pathname.startsWith('/landing/')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/landing/, '/welcome') || '/welcome';
    return NextResponse.redirect(url, 308);
  }

  // Marketing-site cutover: bare domain / www serve the public marketing
  // site (/welcome and friends); everything else on that host redirects to
  // the client portal host. No-op when MARKETING_HOST is unset.
  const decision = marketingDecision(host, pathname, { marketingHost: MARKETING_HOST, clientHost: CLIENT_HOST });
  if (decision.kind === 'canonical-redirect') {
    const url = req.nextUrl.clone();
    url.host = decision.host;
    url.port = '';
    return NextResponse.redirect(url, 308);
  }
  if (decision.kind === 'rewrite') {
    const url = req.nextUrl.clone();
    url.pathname = decision.pathname;
    const reqHeaders = new Headers(req.headers);
    reqHeaders.set('x-pathname', decision.pathname);
    return NextResponse.rewrite(url, { request: { headers: reqHeaders } });
  }
  if (decision.kind === 'root-redirect') {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url, 308);
  }
  if (decision.kind === 'app-redirect') {
    const url = req.nextUrl.clone();
    url.host = decision.host;
    url.port = '';
    return NextResponse.redirect(url, 307);
  }
  // decision.kind === 'pass' | 'none' -> fall through to the existing logic.

  // Client host requesting /welcome directly: with a marketing host
  // configured, that content lives there — send it back to the marketing
  // site's root (or matching sub-path) instead of rendering it twice.
  const welcomeTarget = welcomeRedirect(host, pathname, { marketingHost: MARKETING_HOST, ourHosts: OUR_HOSTS });
  if (welcomeTarget !== null) {
    const url = req.nextUrl.clone();
    return NextResponse.redirect(`https://${MARKETING_HOST}${welcomeTarget}${url.search}`, 308);
  }

  // Subdomain rewrite: admin.flycheap.18dn.com/* -> /admin/*
  if (ADMIN_HOSTS.has(host) && !pathname.startsWith('/admin') && !pathname.startsWith('/login') && !pathname.startsWith('/api')) {
    // Only rewrite paths that are ACTUALLY admin routes. Anything else is a
    // client page (/hotels, /explore, /settings…) that a user reached while
    // on the admin host — usually by clicking a client nav link. Rewriting it
    // to /admin/<path> produced a 404 rendered inside the CLIENT layout, so
    // the sidebar showed client links that all 404'd in turn: a dead end with
    // no way back. Send those to the client host instead.
    const seg = pathname.split('/')[1] ?? '';
    if (seg !== '' && !ADMIN_SEGMENTS.has(seg)) {
      const out = req.nextUrl.clone();
      out.host = CLIENT_HOST;
      out.port = '';
      return NextResponse.redirect(out, 307);
    }
    const url = req.nextUrl.clone();
    url.pathname = `/admin${pathname === '/' ? '' : pathname}`;
    // Forward the rewritten path to the server component via a request header
    // so the /admin layout can build a precise login?next= redirect.
    const reqHeaders = new Headers(req.headers);
    reqHeaders.set('x-pathname', url.pathname);
    return NextResponse.rewrite(url, { request: { headers: reqHeaders } });
  }

  // Inverse redirect: on the client host, /admin should bounce to the admin subdomain.
  if (!ADMIN_HOSTS.has(host) && pathname.startsWith('/admin') && OUR_HOSTS.has(host)) {
    const url = req.nextUrl.clone();
    url.host = ADMIN_HOST;
    url.port = ''; // nextUrl carries the internal :3000 behind the proxy
    url.protocol = 'https:';
    url.pathname = pathname.replace(/^\/admin/, '') || '/';
    return NextResponse.redirect(url);
  }

  const needsAuth = PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (!needsAuth) {
    // Still forward x-pathname for everything else so server components can
    // know the original path if they need to.
    const reqHeaders = new Headers(req.headers);
    reqHeaders.set('x-pathname', pathname);
    return NextResponse.next({ request: { headers: reqHeaders } });
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers: reqHeaders } });
}

export const config = {
  // Skip Next internals + static assets + image optimization.
  matcher: ['/((?!_next/|api/|favicon|icon|robots|sitemap|.*\\..*).*)'],
};

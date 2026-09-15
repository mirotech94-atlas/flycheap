import { NextResponse, type NextRequest } from 'next/server';

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
const ADMIN_HOSTS = new Set(['admin.flycheap.18dn.com']);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = (req.headers.get('host') ?? '').toLowerCase();

  // 308 redirect for the legacy /landing route — content moved to /welcome.
  if (pathname === '/landing' || pathname.startsWith('/landing/')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/landing/, '/welcome') || '/welcome';
    return NextResponse.redirect(url, 308);
  }

  // Subdomain rewrite: admin.flycheap.18dn.com/* -> /admin/*
  if (ADMIN_HOSTS.has(host) && !pathname.startsWith('/admin') && !pathname.startsWith('/login') && !pathname.startsWith('/api')) {
    const url = req.nextUrl.clone();
    url.pathname = `/admin${pathname === '/' ? '' : pathname}`;
    // Forward the rewritten path to the server component via a request header
    // so the /admin layout can build a precise login?next= redirect.
    const reqHeaders = new Headers(req.headers);
    reqHeaders.set('x-pathname', url.pathname);
    return NextResponse.rewrite(url, { request: { headers: reqHeaders } });
  }

  // Inverse redirect: on the client host, /admin should bounce to the admin subdomain.
  if (!ADMIN_HOSTS.has(host) && pathname.startsWith('/admin') && (host === 'flycheap.18dn.com' || host === 'flycheap.18dn.com')) {
    const url = req.nextUrl.clone();
    url.host = 'admin.flycheap.18dn.com';
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

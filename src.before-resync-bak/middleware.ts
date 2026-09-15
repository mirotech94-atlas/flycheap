import { NextResponse, type NextRequest } from 'next/server';

// Hardcoded here (rather than imported from @/lib/auth) so middleware can run
// in the Edge runtime without pulling in the better-sqlite3 / Node-only deps.
// Keep in sync with SESSION_COOKIE in src/lib/auth.ts.
const SESSION_COOKIE = 'fareintel_session';

// Routes the middleware will redirect to /login when no session cookie is present.
// Everything else (welcome, login, share/[token], explore, all /api routes) is public —
// auth-sensitive APIs do their own check inside the route handler.
const PROTECTED_PREFIXES = ['/searches', '/settings'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  // Don't validate the session here (DB access in middleware is awkward in Next).
  // The page itself does the real check via getCurrentUser().
  return NextResponse.next();
}

export const config = {
  // Skip Next internals + static assets + image optimization.
  matcher: ['/((?!_next/|api/|favicon|icon|robots|sitemap|.*\\..*).*)'],
};

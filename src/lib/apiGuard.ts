import 'server-only';
import { NextResponse } from 'next/server';
import { apiAuth, isOwner } from './auth';
import type { UserRow } from './db';

/**
 * Auth guards for route handlers.
 *
 * WHY THIS EXISTS
 * middleware.ts does not run on API routes — its matcher excludes `api/`
 * explicitly:
 *
 *   matcher: ['/((?!_next/|api/|favicon|icon|robots|sitemap|.*\\..*).*)']
 *
 * So an API route is exactly as protected as its own handler makes it, and a
 * handler that simply does the work is reachable by anyone on the internet.
 * Several were. A guard that has to be remembered gets forgotten, so this is
 * the one import that makes remembering cheap.
 *
 * Usage, at the very top of the handler:
 *
 *   const auth = await requireUser(req);   // pass req on POST/PUT/PATCH/DELETE
 *   if (!auth.ok) return auth.response;
 *   auth.user  // UserRow, narrowed
 *
 * Passing `req` also enables the same-origin check. A mutating handler that
 * omits it is caught by tests/api-auth.test.ts.
 */

export type Guard =
  | { ok: true; user: UserRow }
  | { ok: false; response: NextResponse };

/** Verbs that change something and therefore need the origin checked. */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Does this request come from our own pages?
 *
 * PURE so it can be tested without a request context.
 *
 * The rule is: when an Origin (or Referer) is present it must match the host
 * the request arrived on. Absent is ALLOWED, and that is deliberate rather than
 * lax:
 *
 *  - A browser always sends Origin on a cross-origin POST, and on a form POST,
 *    which is the entire CSRF vector. A forged request therefore arrives WITH a
 *    foreign Origin and is rejected here.
 *  - An attacker cannot make a browser omit Origin on a mutation, so rejecting
 *    the absent case buys no security.
 *  - It does break every curl and script that administers the box. Trading real
 *    operational cost for no security gain is a bad trade, and the guard that
 *    gets in the way is the guard that gets disabled.
 *
 * This is defence in depth, not the primary control: every session cookie is
 * `sameSite: 'lax'`, so a cross-site POST/PUT/PATCH/DELETE never carries the
 * session at all. Lax does still send the cookie on a top-level GET navigation,
 * which is why a GET must never change state.
 */
export function originMatches(opts: {
  method: string;
  host: string | null;
  origin: string | null;
  referer: string | null;
}): boolean {
  if (!MUTATING.has(opts.method.toUpperCase())) return true;
  if (!opts.host) return false;

  const claimed = opts.origin || opts.referer;
  if (!claimed) return true;  // see above

  let claimedHost: string;
  try {
    claimedHost = new URL(claimed).host;
  } catch {
    return false;  // an unparseable Origin is not a match
  }
  return claimedHost.toLowerCase() === opts.host.toLowerCase();
}

/**
 * The same check against a real request.
 *
 * The verb has to come from the Request, because `headers()` does not carry it
 * — and guessing would be wrong in both directions. Guessing "mutating" would
 * apply the check to GETs, so following a link to a GET endpoint from anywhere
 * off-site would 403. Guessing "safe" would skip it on the verbs that matter.
 *
 * So a handler that mutates PASSES ITS REQUEST, and the test below fails any
 * mutating handler that forgets to.
 */
function requestOriginOk(req: Request): boolean {
  return originMatches({
    method: req.method,
    host: req.headers.get('host'),
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer'),
  });
}

const CROSS_ORIGIN = () => NextResponse.json(
  { error: 'Cross-origin request refused.' },
  { status: 403 },
);

/** Any signed-in account. */
export async function requireUser(req?: Request): Promise<Guard> {
  const user = await apiAuth();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }),
    };
  }
  // Only the COOKIE-authenticated paths get this. The mobile API authenticates
  // with a Bearer token through apiAuthBearer, which a browser never attaches
  // on its own, so it carries no CSRF risk and never reaches here. Webhooks
  // authenticate by signature and likewise never call this.
  if (req && !requestOriginOk(req)) return { ok: false, response: CROSS_ORIGIN() };
  return { ok: true, user };
}

/**
 * The owner only.
 *
 * For endpoints that change how the SERVICE runs rather than how one account
 * behaves — provider credentials, destructive database maintenance, the global
 * defaults every account inherits.
 *
 * Returns 404, not 403, for a signed-in non-owner: confirming that an
 * owner-only endpoint exists at this path tells an attacker where to aim.
 */
export async function requireOwner(req?: Request): Promise<Guard> {
  const user = await apiAuth();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }),
    };
  }
  if (!isOwner(user)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not found.' }, { status: 404 }),
    };
  }
  if (req && !requestOriginOk(req)) return { ok: false, response: CROSS_ORIGIN() };
  return { ok: true, user };
}

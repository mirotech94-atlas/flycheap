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
 *   const auth = await requireUser();
 *   if (!auth.ok) return auth.response;
 *   auth.user  // UserRow, narrowed
 */

export type Guard =
  | { ok: true; user: UserRow }
  | { ok: false; response: NextResponse };

/** Any signed-in account. */
export async function requireUser(): Promise<Guard> {
  const user = await apiAuth();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }),
    };
  }
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
export async function requireOwner(): Promise<Guard> {
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
  return { ok: true, user };
}

import 'server-only';
import { generateToken, getCurrentUser } from './auth';
import { queries, type UserRow } from './db';

/**
 * Mobile (FlyCheap app) auth — additive layer over the existing session machinery.
 *
 * The native app cannot use the httpOnly `fareintel_session` cookie, so it carries
 * the SAME opaque session token as an `Authorization: Bearer <token>` header instead.
 * We reuse the existing `sessions` table verbatim (token + server-enforced expires_at);
 * the only difference from web is a longer fixed TTL and no Set-Cookie.
 *
 * Deliberate v1 design (see docs/mobile-app/01-PRIORITIES.md):
 *   - Fixed 90-day session, re-login on expiry. No refresh token.
 *   - `getSession` already enforces `expires_at > now()`. There is no extend/touch
 *     primitive, so sliding expiry would require rotating the token every request —
 *     rejected as bad for a mobile client.
 *
 * Nothing here touches the web cookie path (`getCurrentUser`, `/api/auth/verify`).
 */
export const MOBILE_SESSION_DAYS = 90;

// -------- Username rules (shared by the enroll suggest + claim steps) --------
const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/; // 3-20 chars, starts with a letter

export function isValidUsername(u: string): boolean {
  return USERNAME_RE.test(u);
}

/** Best-effort normalize toward a valid username (lowercase, strip junk). */
export function normalizeUsername(input: string): string {
  return (input || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

/** Suggest an available username from an email (prefix → normalized → de-duped). */
export function suggestUsername(email: string): string {
  let base = normalizeUsername(email.split('@')[0] || 'flyer');
  if (!/^[a-z]/.test(base)) base = 'fly' + base;
  base = base.slice(0, 16) || 'flyer';
  if (queries.isUsernameAvailable(base)) return base;
  for (let i = 0; i < 50; i++) {
    const cand = `${base}${Math.floor(10 + Math.random() * 9989)}`;
    if (queries.isUsernameAvailable(cand)) return cand;
  }
  return `${base}${Date.now() % 100000}`;
}

/** Shape returned to the app after a successful verify. */
export type MobileSession = {
  token: string;
  expiresAt: string; // ISO-ish: SQLite datetime('now', '+90 days')
  user: { id: number; email: string; name: string | null; tier: string; username: string | null };
};

function publicUser(u: UserRow): MobileSession['user'] {
  return { id: u.id, email: u.email, name: u.name, tier: u.tier, username: u.username };
}

/**
 * Mint a long-lived mobile Bearer session for an already-authenticated user
 * (used by the TOTP login + enroll endpoints, which do their own auth). Mirrors
 * the cookie-less session creation in consumeMagicLinkForBearer.
 */
export function startBearerSession(userId: number, detail = 'mobile'): MobileSession | null {
  const user = queries.getUserById(userId);
  if (!user) return null;
  const token = generateToken();
  queries.insertSession(token, user.id, MOBILE_SESSION_DAYS);
  const session = queries.getSession(token);
  try {
    queries.insertAudit({ user_id: user.id, email: user.email, action: 'login', entity: 'session', detail, ip: null });
  } catch { /* best-effort */ }
  return { token, expiresAt: session?.expires_at ?? '', user: publicUser(user) };
}

/**
 * Resolve the authenticated user for a `/api/v1/*` request.
 * Prefers the Bearer token (mobile); falls back to the session cookie (so the same
 * v1 routes also work in-browser / for the WebView screens that pass cookies).
 * Returns null on no/invalid/expired credential — callers should 401.
 */
export async function apiAuthBearer(req: Request): Promise<UserRow | null> {
  const auth = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (m) {
    const token = m[1].trim();
    const session = queries.getSession(token); // enforces expiry server-side
    if (!session) return null;
    const user = queries.getUserById(session.user_id);
    return user ?? null;
  }
  // No bearer → fall back to the existing cookie session (read-only path).
  return getCurrentUser();
}

/**
 * Exchange a magic-link token for a long-lived mobile Bearer session WITHOUT
 * setting a cookie. Mirrors `consumeMagicLinkAndStartSession` but returns the
 * token in the response body for the app to store in expo-secure-store.
 * Returns null if the magic-link token is missing/used/expired.
 */
export function consumeMagicLinkForBearer(magicToken: string): MobileSession | null {
  const link = queries.consumeMagicLink(magicToken); // atomic single-use, checks expiry
  if (!link) return null;
  const user = queries.upsertUserByEmail(link.email);

  const token = generateToken();
  queries.insertSession(token, user.id, MOBILE_SESSION_DAYS);
  const session = queries.getSession(token); // read back the server-computed expires_at

  // Audit parity with the web login path (best-effort).
  try {
    const isNew = false; // upsert already ran; we don't distinguish here
    queries.insertAudit({
      user_id: user.id, email: user.email,
      action: isNew ? 'signup' : 'login',
      entity: 'session', detail: 'mobile', ip: null,
    });
  } catch { /* best-effort */ }

  return {
    token,
    expiresAt: session?.expires_at ?? '',
    user: publicUser(user),
  };
}

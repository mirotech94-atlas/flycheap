import 'server-only';
import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { Resend } from 'resend';
import { queries, type UserRow } from './db';
import { ADMIN_HOSTS, APP_URL } from './hosts';

export const SESSION_COOKIE = 'fareintel_session';
export const COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

// Throttle so we don't write an audit row on every single request — once per
// hour per user is enough to keep last_ip / last_action_at fresh. The map is a
// fast path only: Next compiles @/lib/auth into every route bundle separately,
// so each bundle has its own copy. The DB (queries.lastAccessAuditAt) is the
// authority, which is what stops the duplicate rows across pages/restarts.
const _ipTouchAt = new Map<string, number>();
const IP_TOUCH_THROTTLE_MS = 60 * 60 * 1000;

// Requests that originate on the server itself (deploy health checks, QA curl
// runs over SSH, scripts hitting :3000 directly) are tagged internal so they
// never count as a user's "last seen" in the admin views.
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const SELF_IPS = new Set(
  (process.env.SERVER_SELF_IPS || '162.220.53.111').split(',').map(s => s.trim()).filter(Boolean),
);
export function isInternalIp(ip: string | null | undefined): boolean {
  if (!ip) return true; // no proxy header at all → direct hit on :3000
  return LOOPBACK_IPS.has(ip) || SELF_IPS.has(ip);
}

/** Read the current session from the cookie and return the user row, or null. */
export async function getCurrentUser(): Promise<UserRow | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = queries.getSession(token);
  if (!session) return null;
  const user = queries.getUserById(session.user_id);
  if (!user) return null;
  // Cookie-scope upgrade: legacy sessions are scoped to a single subdomain
  // (e.g. flycheap.18dn.com). Re-issue with Domain=.<apex>.<tld> so the same
  // session works on every sibling subdomain (flycheap.18dn.com, etc.).
  // This is idempotent — modern sessions already have the apex scope.
  try { await refreshCookieScope(token); } catch { /* read-path is allowed to fail */ }
  // Refresh last_ip / last_action_at for the admin Sessions view. Throttled.
  try {
    const hdrs = await headers();
    const fwd = hdrs.get('x-forwarded-for') ?? '';
    const ip = fwd.split(',')[0]?.trim() || hdrs.get('x-real-ip') || null;
    const internal = isInternalIp(ip);
    // Real and internal traffic are throttled separately, so a QA run from the
    // box never suppresses the row for the user's own next visit.
    const key = `${user.id}:${internal ? 'i' : 'r'}`;
    const now = Date.now();
    let last = _ipTouchAt.get(key) ?? 0;
    if (now - last > IP_TOUCH_THROTTLE_MS) {
      const dbLast = queries.lastAccessAuditAt(user.id, internal);
      if (dbLast) {
        const t = Date.parse(dbLast.replace(' ', 'T') + 'Z');
        last = Number.isNaN(t) ? 0 : t;
      }
      if (now - last > IP_TOUCH_THROTTLE_MS) {
        queries.insertAudit({
          user_id: user.id, email: user.email,
          action: 'access', entity: 'session',
          detail: internal ? { internal: true } : undefined, ip,
        });
        last = now;
      }
      _ipTouchAt.set(key, last);
    }
  } catch { /* best-effort */ }
  return user;
}

async function refreshCookieScope(token: string): Promise<void> {
  const hdrs = await headers();
  const host = hdrs.get('host') ?? '';
  const proto = hdrs.get('x-forwarded-proto') ?? '';
  const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  if (isLocal) return;
  let domain = process.env.COOKIE_DOMAIN || '';
  if (!domain) {
    const parts = host.split(':')[0].split('.');
    if (parts.length >= 3) domain = '.' + parts.slice(-2).join('.');
  }
  if (!domain) return; // nothing to upgrade
  const secure = proto === 'https' || process.env.NODE_ENV !== 'development';
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true, secure, sameSite: 'lax', path: '/',
    maxAge: COOKIE_MAX_AGE_SEC, domain,
  });
}

/** Throwing variant for protected pages — pair with redirect('/login') if null. */
export async function requireUser(): Promise<UserRow> {
  const u = await getCurrentUser();
  if (!u) throw new Error('UNAUTHENTICATED');
  return u;
}

/**
 * Admin gate — strictly email-allowlist based.
 *
 * The owner email lives in OWNER_EMAIL (single, primary admin) and the
 * fallback list in ADMIN_EMAILS (comma-separated, for ops/support). The
 * legacy `tier === 'enterprise'` bypass is DELIBERATELY removed: tier is
 * controlled by Stripe webhooks, which means any paying customer would have
 * earned the admin bit. Admin is now owner-only by identity.
 */
export function isAdmin(user: UserRow | null | undefined): boolean {
  if (!user) return false;
  const email = user.email.toLowerCase();
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  if (owner && email === owner) return true;
  const allow = (process.env.ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return allow.includes(email);
}

/**
 * Strict owner gate — ONLY the single OWNER_EMAIL identity passes. Used to
 * gate the admin-portal UI link so support/ops admins (ADMIN_EMAILS) don't
 * see a "Switch to admin" button in the client chrome. They can still access
 * /admin directly via URL, but the affordance is hidden from non-owners.
 */
export function isOwner(user: UserRow | null | undefined): boolean {
  if (!user) return false;
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  if (!owner) return false;
  return user.email.toLowerCase() === owner;
}

/** True when the request arrived on the founder-only admin host (admin.<domain>). */
export function isAdminHost(host: string | null | undefined): boolean {
  const h = (host || '').toLowerCase().split(':')[0];
  return ADMIN_HOSTS.has(h) || h.startsWith('admin.');
}
export function ownerEmail(): string {
  return (process.env.OWNER_EMAIL || '').trim().toLowerCase();
}

/** Returns user if authed, else null — for API routes that 401 instead of throwing. */
export async function apiAuth(): Promise<UserRow | null> {
  return getCurrentUser();
}

/** Set the session cookie on the response and create the DB row. */
export async function startSession(userId: number): Promise<string> {
  const token = generateToken();
  queries.insertSession(token, userId, 30);
  const cookieStore = await cookies();
  // Trust the forwarded proto (Caddy fronts the app). Force secure on HTTPS
  // even if NODE_ENV is unset; allow plain HTTP only for localhost dev.
  const proto = (await headers()).get('x-forwarded-proto') ?? '';
  const host = (await headers()).get('host') ?? '';
  const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const secure = proto === 'https' || (!isLocal && process.env.NODE_ENV !== 'development');

  // If COOKIE_DOMAIN is set in env (e.g. ".18dn.com") share the session across
  // all subdomains. Otherwise infer: when host looks like `<sub>.<domain>.<tld>`
  // and we're not on localhost, derive `.<domain>.<tld>` automatically so users
  // logged in on one subdomain (tracker) stay authed on siblings (flycheap).
  let domain = process.env.COOKIE_DOMAIN || '';
  if (!domain && !isLocal) {
    const parts = host.split(':')[0].split('.');
    if (parts.length >= 3) domain = '.' + parts.slice(-2).join('.');
  }

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SEC,
    ...(domain ? { domain } : {}),
  });
  return token;
}

// ── Device token helpers (trusted-device, skip-OTP on returning browsers) ──

export const DEVICE_COOKIE = 'fareintel_device';
const DEVICE_MAX_AGE_SEC = 90 * 24 * 60 * 60; // 90 days

/** Set a device token cookie after successful OTP verification. */
export async function setDeviceToken(userId: number): Promise<void> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + DEVICE_MAX_AGE_SEC * 1000).toISOString();
  queries.createDeviceToken(userId, token, expiresAt);

  const cookieStore = await cookies();
  const hdrs = await headers();
  const host = hdrs.get('host') ?? '';
  const proto = hdrs.get('x-forwarded-proto') ?? '';
  const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const secure = proto === 'https' || (!isLocal && process.env.NODE_ENV !== 'development');
  let domain = process.env.COOKIE_DOMAIN || '';
  if (!domain && !isLocal) {
    const parts = host.split(':')[0].split('.');
    if (parts.length >= 3) domain = '.' + parts.slice(-2).join('.');
  }
  cookieStore.set(DEVICE_COOKIE, `${userId}:${token}`, {
    httpOnly: true, secure, sameSite: 'lax', path: '/',
    maxAge: DEVICE_MAX_AGE_SEC,
    ...(domain ? { domain } : {}),
  });
}

/** Read the device token cookie and return the matching user, or null. */
export async function checkDeviceToken(): Promise<import('./db').UserRow | null> {
  const cookieStore = await cookies();
  const val = cookieStore.get(DEVICE_COOKIE)?.value;
  if (!val) return null;
  const [userIdStr, token] = val.split(':');
  const userId = Number(userIdStr);
  if (!userId || !token) return null;
  const dt = queries.getDeviceToken(userId, token);
  if (!dt) return null;
  return queries.getUserById(userId) ?? null;
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) queries.deleteSession(token);

  // Revoke the trusted-device token too. Without this, /login's auto
  // device-login (LoginForm) immediately mints a fresh session from the
  // still-valid fareintel_device cookie and sign-out appears to do nothing.
  const dev = cookieStore.get(DEVICE_COOKIE)?.value;
  if (dev) {
    const [userIdStr, devToken] = dev.split(':');
    const userId = Number(userIdStr);
    if (userId && devToken) {
      try { queries.deleteDeviceToken(userId, devToken); } catch { /* best-effort */ }
    }
  }

  // Delete both forms — bare cookie and the apex-domain one (`.18dn.com`).
  const host = (await headers()).get('host') ?? '';
  const parts = host.split(':')[0].split('.');
  const apex = parts.length >= 3 ? '.' + parts.slice(-2).join('.') : '';
  for (const name of [SESSION_COOKIE, DEVICE_COOKIE]) {
    cookieStore.delete(name);
    if (apex) {
      cookieStore.set(name, '', {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0,
        domain: apex,
      });
    }
  }
}

/**
 * Send a magic-login link via Resend. Returns { ok, error? }.
 *
 * `mode` selects the return path embedded in the email:
 *   - 'web'    (default) → `/api/auth/verify?token=` GET redirect — the existing browser flow, unchanged.
 *   - 'mobile' → `/m/verify?token=` universal link (opens the FlyCheap app, or the web fallback page
 *                if the app isn't installed) PLUS a `flycheap://verify?token=` custom-scheme button.
 */
export async function sendMagicLink(
  email: string,
  baseUrl: string,
  opts: { mode?: 'web' | 'mobile' } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };

  const mode = opts.mode ?? 'web';
  const token = generateToken();
  queries.insertMagicLink(token, email, 15);
  const base = baseUrl.replace(/\/$/, '');
  const link = mode === 'mobile'
    ? `${base}/m/verify?token=${token}`
    : `${base}/api/auth/verify?token=${token}`;
  const schemeLink = `flycheap://verify?token=${token}`;

  const resend = new Resend(apiKey);
  const { supportFrom } = await import('./senders');
  const from = supportFrom('FlyCheap Sign-in');
  // Mobile emails offer a custom-scheme fallback button under the primary (universal) link,
  // for the email clients that don't honor associated-domain links.
  const mobileFallback = mode === 'mobile'
    ? `<p style="margin:16px 0 0"><a href="${schemeLink}" style="display:inline-block;background:#eef4fb;color:#0a3a6b;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px">Open in the FlyCheap app</a></p>`
    : '';
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:560px;margin:auto;padding:32px;color:#0f172a">
      <div style="display:inline-block;background:#eef4fb;color:#0a3a6b;font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:6px 12px;border-radius:999px;margin-bottom:16px">Sign in</div>
      <h1 style="font-size:28px;margin:0 0 8px;color:#0a3a6b">Sign in to FlyCheap</h1>
      <p style="color:#475569;margin:0 0 24px">Click the button below to sign in. Link is valid for 15 minutes.</p>
      <a href="${link}" style="display:inline-block;background:#0a3a6b;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700">Sign in →</a>
      ${mobileFallback}
      <p style="color:#94a3b8;margin:24px 0 0;font-size:12px">If you didn't request this, you can safely ignore it.</p>
      <p style="color:#94a3b8;margin:8px 0 0;font-size:11px;word-break:break-all">${link}</p>
    </div>
  `;
  try {
    const r = await resend.emails.send({
      from, to: email,
      subject: 'Sign in to FlyCheap',
      html,
    });
    if (r.error) return { ok: false, error: r.error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Send a 6-digit sign-in / authenticator-recovery code (the FlyCheap app's first-time
 * verification — replaces the magic LINK whose universal-link handoff was unreliable).
 * The caller stores the code (queries.insertEmailCode); this only sends the email.
 */
export async function sendEmailCode(email: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };
  const resend = new Resend(apiKey);
  const { supportFrom } = await import('./senders');
  const from = supportFrom('FlyCheap Sign-in');
  const spaced = code.split('').join(' ');
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:480px;margin:auto;padding:32px;color:#0f172a;text-align:center">
      <div style="display:inline-block;background:#eef4fb;color:#0a3a6b;font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:6px 12px;border-radius:999px;margin-bottom:20px">FlyCheap sign-in</div>
      <h1 style="font-size:24px;margin:0 0 8px;color:#0a3a6b">Your sign-in code</h1>
      <p style="color:#475569;margin:0 0 24px;font-size:15px">Enter this code in the FlyCheap app. It expires in 10 minutes.</p>
      <div style="font-size:40px;font-weight:800;letter-spacing:10px;color:#0a3a6b;background:#f6f8fc;border-radius:14px;padding:20px 12px;font-family:'JetBrains Mono',ui-monospace,monospace">${spaced}</div>
      <p style="color:#94a3b8;margin:24px 0 0;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
  try {
    const r = await resend.emails.send({ from, to: email, subject: `${code} is your FlyCheap sign-in code`, html });
    if (r.error) return { ok: false, error: r.error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Verify a magic-link token, create/upsert the user, start a session. Returns the user. */
export async function consumeMagicLinkAndStartSession(token: string, opts?: { ip?: string | null }): Promise<UserRow | null> {
  const link = queries.consumeMagicLink(token);
  if (!link) return null;
  // Detect "first ever signup" before upsert so we can send the welcome email exactly once.
  const isNewSignup = !queries.getUserByEmail(link.email);
  const user = queries.upsertUserByEmail(link.email);
  await startSession(user.id);
  // Audit the login so the admin /sessions view can show name + last IP.
  try {
    queries.insertAudit({
      user_id: user.id,
      email: user.email,
      action: isNewSignup ? 'signup' : 'login',
      entity: 'session',
      detail: null,
      ip: opts?.ip ?? null,
    });
  } catch { /* best-effort */ }
  if (isNewSignup) {
    // Fire-and-forget — don't block the redirect on a transient SMTP hiccup.
    sendWelcomeEmail(user.email).catch(() => { /* logged elsewhere */ });
    // Founder heads-up in #admin_alerts (see notifier.ts). Dynamic import avoids
    // pulling the notifier's provider deps into every auth consumer.
    import('./notifier')
      .then(m => m.notifySignupToSlack(user, 'magic-link', opts?.ip ?? null))
      .catch(() => { /* non-critical */ });
  }
  return user;
}

/** First-signup welcome with quick-start tips. Idempotent at the DB layer. */
export async function sendWelcomeEmail(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);
  const { supportFrom } = await import('./senders');
  const from = supportFrom('FlyCheap');
  const { unsubscribeUrl } = await import('@/app/api/unsubscribe/route');
  const unsubLink = unsubscribeUrl(email, APP_URL);
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:560px;margin:auto;padding:32px;color:#0f172a">
      <div style="display:inline-block;background:linear-gradient(135deg,#0a3a6b,#1f5fa5);color:white;font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:6px 12px;border-radius:999px;margin-bottom:16px">Welcome aboard ✈️</div>
      <h1 style="font-size:32px;margin:0 0 8px;color:#0a3a6b;line-height:1.1">Welcome to FlyCheap</h1>
      <p style="color:#475569;margin:0 0 24px;font-size:16px;line-height:1.5">Your first 3 months are on us — full use of the basic capabilities, no card. Here's what to do in your first 60 seconds:</p>

      <ol style="margin:0 0 24px;padding-left:20px;color:#334155;line-height:1.7">
        <li><strong>Add your first route</strong> — pick a home airport and destination at <a href="${APP_URL}/searches" style="color:#0a3a6b;font-weight:600">/searches</a>. We'll start polling every 30 minutes.</li>
        <li><strong>Set your target price</strong> in <a href="${APP_URL}/settings" style="color:#0a3a6b;font-weight:600">Settings</a>. Get an email the moment any tracked fare drops below it.</li>
        <li><strong>Explore worldwide</strong> deals at <a href="${APP_URL}/explore" style="color:#0a3a6b;font-weight:600">/explore</a> — see the cheapest flights from your home city, color-coded on a world map.</li>
      </ol>

      <a href="${APP_URL}/" style="display:inline-block;background:linear-gradient(180deg,#1f5fa5,#0a3a6b);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Open the dashboard →</a>

      <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.6">
        Questions? Reply to this email — it lands in our inbox.<br>
        Your founding period covers 5 tracked routes, email alerts and worldwide explore for 3 months. Whenever you want more — up to 100 routes, 5-minute polling, SMS/WhatsApp/Telegram alerts — Pro is $9/mo, and Enterprise adds white-label + API.<br><br>
        <a href="${unsubLink}" style="color:#94a3b8;text-decoration:underline">Unsubscribe</a> · <a href="${APP_URL}/settings" style="color:#94a3b8;text-decoration:underline">Manage preferences</a>
      </div>
    </div>
  `;
  try {
    await resend.emails.send({
      from, to: email,
      subject: 'Welcome to FlyCheap ✈️ — quick start in 60 seconds',
      html,
      headers: {
        // RFC 8058: enables one-click unsub button in Gmail/Apple Mail/Outlook
        'List-Unsubscribe': `<${unsubLink}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
  } catch { /* swallow */ }
}

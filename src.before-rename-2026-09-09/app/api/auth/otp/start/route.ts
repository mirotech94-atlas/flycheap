import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { queries } from '@/lib/db';
import { sendEmailCode } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Passwordless sign-in — step 1: send a 6-digit code.
 *
 * Body: { mode: 'login' | 'signup', identifier: string, username?: string }
 *   - signup → identifier is an email, username is required (3–30 chars).
 *   - login  → identifier is a username OR an email; we look the account up and
 *              mail the code to its email (so the email is never exposed to the
 *              client). Returns a masked hint of where it went.
 *
 * This replaces the recurring magic LINK: after a user's first sign-up the
 * browser remembers their username, so returning visits are just username + code.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}
function gen6(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}
function maskEmail(e: string): string {
  const [u, d] = e.split('@');
  if (!d) return e;
  const um = u.length <= 2 ? `${u[0]}*` : `${u[0]}${'*'.repeat(Math.max(1, u.length - 2))}${u[u.length - 1]}`;
  return `${um}@${d}`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === 'signup' ? 'signup' : 'login';
  const identifier = String(body?.identifier ?? '').trim();
  const ip = clientIp(req);

  // Per-IP throttle (uniform-ish response to limit probing).
  if (!queries.rateLimitCheck('otp_ip', ip, 25, 3600)) {
    return NextResponse.json({ ok: false, error: 'Too many requests — try again shortly.' }, { status: 429 });
  }
  if (!identifier) {
    return NextResponse.json({ ok: false, error: 'Enter your email or username.' }, { status: 400 });
  }

  let email: string | null = null;

  if (mode === 'signup') {
    const em = identifier.toLowerCase();
    if (!EMAIL_RE.test(em)) {
      return NextResponse.json({ ok: false, error: 'Enter a valid email to sign up.' }, { status: 400 });
    }
    const username = String(body?.username ?? '').trim();
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json({ ok: false, error: 'Username must be 3–30 letters, numbers, or . _ -' }, { status: 400 });
    }
    const existing = queries.getUserByEmail(em);
    // Username must be free (unless it already belongs to this same email).
    if (!queries.isUsernameAvailable(username, existing?.id)) {
      return NextResponse.json({ ok: false, error: 'That username is taken — pick another.' }, { status: 409 });
    }
    email = em;
  } else {
    // login: identifier is a username or an email
    const user = identifier.includes('@')
      ? queries.getUserByEmail(identifier.toLowerCase())
      : queries.getUserByUsername(identifier);
    if (!user) {
      return NextResponse.json({
        ok: false,
        error: identifier.includes('@')
          ? 'No account with that email — switch to Sign up.'
          : 'No account with that username — try your email, or Sign up.',
      }, { status: 404 });
    }
    email = user.email;
  }

  if (!email) {
    return NextResponse.json({ ok: false, error: 'Could not resolve your account.' }, { status: 400 });
  }

  // Per-email throttle: 4 codes per 10 min.
  if (!queries.rateLimitCheck('otp_email', email, 4, 600)) {
    return NextResponse.json({ ok: true, masked: maskEmail(email) });
  }

  const code = gen6();
  queries.insertEmailCode(email, code, 10);
  const r = await sendEmailCode(email, code);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, masked: maskEmail(email) });
}

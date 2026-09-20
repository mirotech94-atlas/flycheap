import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateToken } from '@/lib/auth';
import { startBearerSession, suggestUsername } from '@/lib/mobileAuth';
import { generateSecret, otpauthUri } from '@/lib/totp';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(8),
  // The app collects these on the signup screen; they were being dropped.
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
});

/**
 * POST /api/v1/auth/email/verify  { email, code, name?, phone? }
 *
 * Two outcomes, keyed by `mode`:
 *
 *   mode: 'session'  The account ALREADY EXISTED and has no authenticator, so the
 *                    emailed code is the whole sign-in. Accounts that predate the
 *                    authenticator flow are not made to retrofit 2FA they never
 *                    asked for. Returns a live bearer session.
 *
 *   mode: 'enroll'   A brand-new signup, or an existing user who already HAS an
 *                    authenticator and is recovering it. Stages a CANDIDATE secret
 * (not yet active — see pending_enrollments) and returns everything the app needs to
 * show the QR: { enrollToken, otpauthUri, secret, suggestedUsername, isNewUser }.
 * Works for brand-new signups AND existing users re-enrolling a lost authenticator;
 * the live secret is left untouched until /enroll confirms a real code.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'email and code required' }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  const code = parsed.data.code.replace(/\D/g, '');

  const result = queries.checkEmailCode(email, code);
  if (result !== 'ok') {
    const status = result === 'too_many' ? 429 : 401;
    const msg = result === 'too_many' ? 'Too many attempts. Request a new code.'
      : result === 'expired' ? 'Code expired. Request a new one.'
      : 'Incorrect code.';
    return NextResponse.json({ error: msg }, { status });
  }

  const existing = queries.getUserByEmail(email);
  const isNewUser = !existing;
  const user = queries.upsertUserByEmail(email);

  // Only fills blanks — never overwrites a name or phone the account already has.
  if (parsed.data.name || parsed.data.phone) {
    try { queries.setProfileIfEmpty(user.id, parsed.data.name ?? null, parsed.data.phone ?? null); }
    catch { /* best-effort */ }
  }

  // Accounts that already existed before the authenticator flow sign in with the
  // emailed code alone. We do not retrofit 2FA onto people who never asked for
  // it — enrollment is for BRAND-NEW signups, and for an existing user who
  // already has an authenticator and is recovering it.
  if (existing && !existing.totp_enabled) {
    const session = startBearerSession(user.id, 'mobile-email');
    if (!session) return NextResponse.json({ error: 'Could not start session.' }, { status: 500 });
    return NextResponse.json({ mode: 'session', ...session });
  }

  const secret = generateSecret();
  const enrollToken = generateToken();
  queries.insertPendingEnrollment(enrollToken, user.id, secret, 15);

  const suggestedUsername = user.username ?? suggestUsername(email);

  return NextResponse.json({
    mode: 'enroll',
    enrollToken,
    secret,
    otpauthUri: otpauthUri(secret, email),
    suggestedUsername,
    isNewUser,
  });
}

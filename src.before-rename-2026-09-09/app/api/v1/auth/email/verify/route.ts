import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateToken } from '@/lib/auth';
import { suggestUsername } from '@/lib/mobileAuth';
import { generateSecret, otpauthUri } from '@/lib/totp';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Body = z.object({ email: z.string().email(), code: z.string().min(4).max(8) });

/**
 * POST /api/v1/auth/email/verify  { email, code }
 * Verifies the emailed 6-digit code, then stages a CANDIDATE authenticator secret
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

  const isNewUser = !queries.getUserByEmail(email);
  const user = queries.upsertUserByEmail(email);

  const secret = generateSecret();
  const enrollToken = generateToken();
  queries.insertPendingEnrollment(enrollToken, user.id, secret, 15);

  const suggestedUsername = user.username ?? suggestUsername(email);

  return NextResponse.json({
    enrollToken,
    secret,
    otpauthUri: otpauthUri(secret, email),
    suggestedUsername,
    isNewUser,
  });
}

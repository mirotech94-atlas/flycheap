import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidUsername, normalizeUsername, startBearerSession } from '@/lib/mobileAuth';
import { verify as verifyTotp } from '@/lib/totp';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Body = z.object({
  enrollToken: z.string().min(10),
  username: z.string().min(1).max(40),
  code: z.string().min(6).max(8),
});

/**
 * POST /api/v1/auth/enroll  { enrollToken, username, code }
 * Final step of first-sign-in / recovery: confirms the user can read a live code from
 * their authenticator, claims the (unique) username, promotes the staged secret to live,
 * and returns a 90-day Bearer session. Only here does totp_enabled flip to 1.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'enrollToken, username and code required' }, { status: 400 });

  const pending = queries.getPendingEnrollment(parsed.data.enrollToken);
  if (!pending) return NextResponse.json({ error: 'Enrollment expired. Start again.' }, { status: 401 });

  const username = normalizeUsername(parsed.data.username);
  if (!isValidUsername(username)) {
    return NextResponse.json({ error: '3–20 characters: letters, numbers, underscore; must start with a letter.', field: 'username' }, { status: 400 });
  }
  if (!queries.isUsernameAvailable(username, pending.user_id)) {
    return NextResponse.json({ error: 'That username is taken. Try another.', field: 'username' }, { status: 409 });
  }

  const code = parsed.data.code.replace(/\D/g, '');
  if (!verifyTotp(pending.secret, code)) {
    queries.bumpPendingEnrollmentAttempt(parsed.data.enrollToken);
    return NextResponse.json({ error: 'That code didn’t match. Check your authenticator and try again.', field: 'code' }, { status: 401 });
  }

  queries.promoteEnrollment(pending.user_id, username, pending.secret);
  queries.deletePendingEnrollment(parsed.data.enrollToken);

  const session = startBearerSession(pending.user_id, 'mobile-enroll');
  if (!session) return NextResponse.json({ error: 'Could not start session.' }, { status: 500 });
  return NextResponse.json(session);
}

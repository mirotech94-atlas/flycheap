import { NextResponse } from 'next/server';
import { queries } from '@/lib/db';
import { startSession, setDeviceToken, sendWelcomeEmail } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Passwordless sign-in — step 2: verify the 6-digit code, then start a session.
 *
 * Body: { mode: 'login' | 'signup', identifier: string, username?: string, code: string }
 * Mirrors /api/auth/otp/start to resolve the same email the code was mailed to.
 */

function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === 'signup' ? 'signup' : 'login';
  const identifier = String(body?.identifier ?? '').trim();
  const code = String(body?.code ?? '').trim();
  const chosenUsername = String(body?.username ?? '').trim();

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: 'Enter the 6-digit code.' }, { status: 400 });
  }

  // Resolve the email the code was sent to — same rules as /otp/start.
  let email: string | null = null;
  if (mode === 'signup') {
    email = identifier.toLowerCase();
  } else {
    const user = identifier.includes('@')
      ? queries.getUserByEmail(identifier.toLowerCase())
      : queries.getUserByUsername(identifier);
    email = user?.email ?? null;
  }
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Account not found — request a new code.' }, { status: 404 });
  }

  const result = queries.checkEmailCode(email, code);
  if (result !== 'ok') {
    const msg = result === 'expired'
      ? 'That code expired — request a new one.'
      : result === 'too_many'
        ? 'Too many attempts — request a new code.'
        : 'Incorrect code — check and try again.';
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }

  const isNew = !queries.getUserByEmail(email);
  const user = queries.upsertUserByEmail(email);

  // On sign-up, set the chosen username if the account doesn't have one yet and
  // it's still free. (Existing users keep their established username.)
  if (chosenUsername && !user.username && queries.isUsernameAvailable(chosenUsername, user.id)) {
    queries.setUsername(user.id, chosenUsername);
  }

  await startSession(user.id);
  await setDeviceToken(user.id);
  try {
    queries.insertAudit({
      user_id: user.id, email: user.email,
      action: isNew ? 'signup' : 'login', entity: 'session', detail: 'otp', ip: clientIp(req),
    });
  } catch { /* best-effort */ }
  if (isNew) sendWelcomeEmail(user.email).catch(() => { /* logged elsewhere */ });

  const fresh = queries.getUserById(user.id)!;
  return NextResponse.json({ ok: true, isNew, username: fresh.username ?? null });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeUsername, startBearerSession } from '@/lib/mobileAuth';
import { verify as verifyTotp } from '@/lib/totp';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Body = z.object({ username: z.string().min(1).max(40), code: z.string().min(6).max(8) });

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

/**
 * POST /api/v1/auth/login  { username, code }
 * Returning-user login with an authenticator code. Locks out by BOTH username and IP
 * (10 tries / 5 min each) to blunt code guessing. A generic 401 on any failure avoids
 * leaking whether the username exists.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'username and code required' }, { status: 400 });

  const username = normalizeUsername(parsed.data.username);
  const ip = clientIp(req);
  const userOk = queries.rateLimitCheck('totp_login_user', username || 'unknown', 10, 300);
  const ipOk = queries.rateLimitCheck('totp_login_ip', ip, 30, 300);
  if (!userOk || !ipOk) {
    return NextResponse.json({ error: 'Too many attempts. Wait a few minutes and try again.' }, { status: 429 });
  }

  const user = queries.getUserByUsername(username);
  const code = parsed.data.code.replace(/\D/g, '');
  // Uniform 401 whether the username is unknown, TOTP isn't set up, or the code is wrong.
  if (!user || !user.totp_enabled || !user.totp_secret || !verifyTotp(user.totp_secret, code)) {
    return NextResponse.json({ error: 'Incorrect username or code.' }, { status: 401 });
  }

  const session = startBearerSession(user.id, 'mobile-totp');
  if (!session) return NextResponse.json({ error: 'Could not start session.' }, { status: 500 });
  return NextResponse.json(session);
}

import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { z } from 'zod';
import { getCurrentUser, isOwner, SESSION_COOKIE } from '@/lib/auth';
import { queries } from '@/lib/db';
import { generateSecret, otpauthUri, verify as verifyTotp } from '@/lib/totp';
import { adminHostOk, sameOriginOk } from '@/lib/adminGuard';
import { stepUpValid } from '@/lib/adminAgentState';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  action: z.enum(['begin', 'confirm']),
  secret: z.string().max(64).optional(),
  code: z.string().max(12).optional(),
  current_code: z.string().max(12).optional(),
});

function audit(userId: number | null, note: string, ok: boolean) {
  try { queries.logAdminAgentAction({ adminUserId: userId, tool: 'totp_enroll', input: '', resultPreview: note, ok }); } catch { /* best-effort */ }
}

// Owner-only self-serve TOTP enrolment. Re-enrolling an ALREADY-enabled factor
// requires proof of the current factor (active step-up or the current code), so
// a stolen session cannot silently swap the second factor (B1).
export async function POST(req: Request) {
  const h = await headers();
  if (!adminHostOk(h)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!sameOriginOk(h)) return NextResponse.json({ error: 'Cross-origin request refused.' }, { status: 403 }); // B2

  const me = await getCurrentUser().catch(() => null);
  if (!me || !isOwner(me)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  // Env-managed TOTP is authoritative — the enrol endpoint cannot change it.
  if (process.env.OWNER_TOTP_SECRET) {
    audit(me.id, 'refused: env-managed 2fa', false);
    return NextResponse.json({ error: 'Two-factor is managed by server configuration and cannot be changed here.' }, { status: 409 });
  }

  const currentlyEnabled = me.totp_enabled === 1 && !!me.totp_secret;

  if (parsed.data.action === 'begin') {
    audit(me.id, 'begin', true);
    const secret = generateSecret();
    return NextResponse.json({ secret, otpauth: otpauthUri(secret, me.email) });
  }

  // confirm
  const secret = (parsed.data.secret ?? '').trim();
  const code = (parsed.data.code ?? '').trim();

  // B1: proof of the CURRENT factor before replacing it.
  if (currentlyEnabled) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
    const proven = stepUpValid(token) || (!!parsed.data.current_code && verifyTotp(me.totp_secret as string, parsed.data.current_code.trim()));
    if (!proven) {
      audit(me.id, 'refused: no proof of current factor', false);
      return NextResponse.json({ error: 'Re-enrolling two-factor requires your current authenticator code (or an active step-up).', need_current_code: true }, { status: 403 });
    }
  }

  if (!secret || !verifyTotp(secret, code)) {
    audit(me.id, 'confirm: bad code', false);
    return NextResponse.json({ error: 'That code did not verify — try again.' }, { status: 401 });
  }
  queries.enableOwnerTotp(me.id, secret);
  audit(me.id, currentlyEnabled ? 'confirm: factor replaced' : 'confirm: enabled', true);
  return NextResponse.json({ ok: true });
}

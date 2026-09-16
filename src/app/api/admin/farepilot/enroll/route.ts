import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getCurrentUser, isOwner, isAdminHost } from '@/lib/auth';
import { queries } from '@/lib/db';
import { generateSecret, otpauthUri, verify as verifyTotp } from '@/lib/totp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  action: z.enum(['begin', 'confirm']),
  secret: z.string().max(64).optional(),
  code: z.string().max(12).optional(),
});

// Owner-only self-serve TOTP enrolment for the FarePilot console. The candidate
// secret round-trips through the client (as the QR/secret does anyway) and is
// only persisted once a live code confirms it.
export async function POST(req: Request) {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  if (!isAdminHost(host)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const me = await getCurrentUser().catch(() => null);
  if (!me || !isOwner(me)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  if (parsed.data.action === 'begin') {
    const secret = generateSecret();
    return NextResponse.json({ secret, otpauth: otpauthUri(secret, me.email) });
  }
  // confirm
  const secret = (parsed.data.secret ?? '').trim();
  const code = (parsed.data.code ?? '').trim();
  if (!secret || !verifyTotp(secret, code)) return NextResponse.json({ error: 'That code did not verify — try again.' }, { status: 401 });
  queries.enableOwnerTotp(me.id, secret);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';
import { sendTwilio } from '@/lib/notifier';

export const dynamic = 'force-dynamic';

const E164 = /^\+[1-9]\d{7,14}$/;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  if (!E164.test(phone)) {
    return NextResponse.json({ ok: false, error: 'Invalid phone format. Use E.164 (e.g. +15551234567).' }, { status: 400 });
  }

  // Simple per-user rate limit: max 5 send-code attempts per hour.
  const allowed = queries.rateLimitCheck('sms_send_code', String(user.id), 5, 60 * 60);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const expires = Date.now() + 10 * 60 * 1000;

  queries.setUserSetting(user.id, 'sms_pending_phone', phone);
  queries.setUserSetting(user.id, 'sms_pending_code', code);
  queries.setUserSetting(user.id, 'sms_pending_expires', String(expires));

  const r = await sendTwilio(
    'sms',
    phone,
    `FlyCheap: Your verification code is ${code}. Expires in 10 minutes. Reply STOP to opt out.`,
  );
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error || r.skipped || 'Failed to send SMS.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

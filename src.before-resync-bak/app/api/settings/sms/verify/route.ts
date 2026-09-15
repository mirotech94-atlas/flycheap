import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';
import { sendTwilio } from '@/lib/notifier';

export const dynamic = 'force-dynamic';

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: 'Invalid code format.' }, { status: 400 });
  }

  const pendingCode = queries.getUserSetting(user.id, 'sms_pending_code');
  const pendingPhone = queries.getUserSetting(user.id, 'sms_pending_phone');
  const pendingExpires = queries.getUserSetting(user.id, 'sms_pending_expires');

  if (!pendingCode || !pendingPhone || !pendingExpires) {
    return NextResponse.json({ ok: false, error: 'No pending verification. Request a new code.' }, { status: 400 });
  }
  if (Date.now() > Number(pendingExpires)) {
    queries.deleteUserSetting(user.id, 'sms_pending_code');
    queries.deleteUserSetting(user.id, 'sms_pending_phone');
    queries.deleteUserSetting(user.id, 'sms_pending_expires');
    return NextResponse.json({ ok: false, error: 'Invalid or expired code' }, { status: 400 });
  }
  if (!constantTimeEqual(code, pendingCode)) {
    return NextResponse.json({ ok: false, error: 'Invalid or expired code' }, { status: 400 });
  }

  queries.setUserSetting(user.id, 'sms_phone', pendingPhone);
  queries.setUserSetting(user.id, 'sms_opt_in', 'true');
  queries.setUserSetting(user.id, 'sms_verified', 'true');
  queries.deleteUserSetting(user.id, 'sms_pending_code');
  queries.deleteUserSetting(user.id, 'sms_pending_phone');
  queries.deleteUserSetting(user.id, 'sms_pending_expires');

  // Welcome / compliance message — fire-and-forget; do not fail verify if SMS API is flaky.
  sendTwilio(
    'sms',
    pendingPhone,
    `FlyCheap: You're subscribed to SMS fare alerts. Reply STOP to cancel, HELP for help. Msg & data rates may apply.`,
  ).catch(() => { /* ignore */ });

  return NextResponse.json({ ok: true });
}

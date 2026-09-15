import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  // Preserve sms_phone + sms_verified so we know they were previously verified
  // (re-subscribe via START works without re-verifying).
  queries.setUserSetting(user.id, 'sms_opt_in', 'false');
  return NextResponse.json({ ok: true });
}

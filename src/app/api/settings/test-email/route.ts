import { NextResponse } from 'next/server';
import { sendTestNotification } from '@/lib/notifier';
import { requireUser } from '@/lib/apiGuard';

export const dynamic = 'force-dynamic';

export async function POST() {
  // GUARD: middleware.ts does not run on api/ routes, so this handler is
  // the only thing protecting it. Sends an email on demand.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const r = await sendTestNotification('email');
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error || r.skipped || 'unknown' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: r.id });
}

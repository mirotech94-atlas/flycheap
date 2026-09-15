import { NextResponse } from 'next/server';
import { sendTestNotification } from '@/lib/notifier';

export const dynamic = 'force-dynamic';

export async function POST() {
  const r = await sendTestNotification('email');
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error || r.skipped || 'unknown' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: r.id });
}

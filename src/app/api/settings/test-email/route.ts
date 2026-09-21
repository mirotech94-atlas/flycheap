import { NextResponse } from 'next/server';
import { sendTestNotification } from '@/lib/notifier';
import { requireUser } from '@/lib/apiGuard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // GUARD: middleware.ts does not run on api/ routes, so this handler is
  // the only thing protecting it. Sends an email on demand.
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const r = await sendTestNotification('email');
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error || r.skipped || 'unknown' }, { status: 500 });
  }
  // Report the address the notifier actually used. The form field can hold
  // an edited-but-unsaved value, and the send reads the SAVED alert_email —
  // quoting the field told the owner to check an address nothing was sent to.
  return NextResponse.json({ ok: true, id: r.id, to: r.to ?? null });
}

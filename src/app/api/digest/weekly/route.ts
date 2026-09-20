import { NextResponse } from 'next/server';
import { sendAnomalyDigest } from '@/lib/digest';
import { requireOwner } from '@/lib/apiGuard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // GUARD: middleware.ts does not run on api/ routes, so this handler is
  // the only thing protecting it. Sends email to real subscribers.
  const auth = await requireOwner(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const result = await sendAnomalyDigest(body?.to);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, id: result.id, sentTo: result.sentTo });
}

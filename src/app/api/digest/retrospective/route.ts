import { NextResponse } from 'next/server';
import { sendRetrospectiveDigest, type RetrospectiveWindow } from '@/lib/digest';
import { requireOwner } from '@/lib/apiGuard';

export const dynamic = 'force-dynamic';

const VALID: RetrospectiveWindow[] = ['monthly', 'six-month', 'annual'];

function isWindow(s: string | undefined | null): s is RetrospectiveWindow {
  return typeof s === 'string' && (VALID as string[]).includes(s);
}

export async function POST(req: Request) {
  // GUARD: middleware.ts does not run on api/ routes, so this handler is
  // the only thing protecting it. Sends email to real subscribers.
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const win = body?.window ?? url.searchParams.get('window');
  if (!isWindow(win)) {
    return NextResponse.json({ error: `window must be one of: ${VALID.join(', ')}` }, { status: 400 });
  }
  const result = await sendRetrospectiveDigest(win, body?.to);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, id: result.id, sentTo: result.sentTo, window: win });
}

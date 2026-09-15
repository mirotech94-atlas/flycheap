import { NextResponse } from 'next/server';
import { sendAnomalyDigest } from '@/lib/digest';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await sendAnomalyDigest(body?.to);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, id: result.id, sentTo: result.sentTo });
}

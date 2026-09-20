import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendDigest } from '@/lib/digest';
import { requireOwner } from '@/lib/apiGuard';

const Schema = z.object({
  to: z.string().email().optional(),
  headline: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  // GUARD: middleware.ts does not run on api/ routes, so this handler is
  // the only thing protecting it. Sends email to real subscribers.
  const auth = await requireOwner(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await sendDigest(parsed.data.to, parsed.data.headline);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, id: result.id, sentTo: result.sentTo });
}

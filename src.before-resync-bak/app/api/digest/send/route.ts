import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendDigest } from '@/lib/digest';

const Schema = z.object({
  to: z.string().email().optional(),
  headline: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await sendDigest(parsed.data.to, parsed.data.headline);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, id: result.id, sentTo: result.sentTo });
}

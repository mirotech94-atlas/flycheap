import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendMagicLink } from '@/lib/auth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Body = z.object({ email: z.string().email() });

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  const first = fwd.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Valid email required.' }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  const ip = clientIp(req);

  // Per-email: 3 sends per 10 min. Per-IP: 20 sends per hour.
  // Uniform success response either way → no email enumeration.
  const emailOk = queries.rateLimitCheck('login_email', email, 3, 600);
  const ipOk = queries.rateLimitCheck('login_ip', ip, 20, 3600);
  if (!emailOk || !ipOk) {
    return NextResponse.json({ ok: true });
  }

  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'flycheap.live';
  const baseUrl = `${proto}://${host}`;

  const r = await sendMagicLink(email, baseUrl);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}

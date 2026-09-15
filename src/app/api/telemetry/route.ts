import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/lib/auth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EventSchema = z.object({
  t: z.string().min(1).max(48),
  path: z.string().max(300).optional(),
  target: z.string().max(160).optional(),
  value: z.string().max(300).optional(),
  x: z.number().int().min(-100000).max(100000).optional(),
  y: z.number().int().min(-100000).max(100000).optional(),
  moveCount: z.number().int().min(0).max(10000).optional(),
  durationMs: z.number().int().min(0).max(120000).optional(),
  detail: z.unknown().optional(),
});

const PayloadSchema = z.object({
  sessionId: z.string().min(8).max(96),
  events: z.array(EventSchema).min(1).max(40),
});

function clientIp(req: Request): string | null {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null;
}

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const ip = clientIp(req);
  if (!queries.rateLimitCheck('telemetry', ip ?? parsed.data.sessionId, 240, 60)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? queries.getSession(token) : undefined;
  const userAgent = req.headers.get('user-agent')?.slice(0, 300) ?? null;
  queries.insertUserEvents(parsed.data.events.map(event => ({
    session_id: parsed.data.sessionId,
    user_id: session?.user_id ?? null,
    event_type: event.t,
    path: event.path ?? null,
    target: event.target ?? null,
    value: event.value ?? null,
    x: event.x ?? null,
    y: event.y ?? null,
    move_count: event.moveCount ?? null,
    duration_ms: event.durationMs ?? null,
    detail: event.detail ?? null,
    user_agent: userAgent,
    ip,
  })));

  return NextResponse.json({ ok: true });
}

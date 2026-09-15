import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Body = z.object({
  token: z.string().min(10).max(200),
  platform: z.enum(['ios', 'android']).optional(),
});

/** POST /api/v1/devices — register (or re-bind) an Expo push token for this user. */
export async function POST(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'token required' }, { status: 400 });

  queries.upsertPushDevice(parsed.data.token, user.id, parsed.data.platform ?? null);
  return NextResponse.json({ ok: true });
}

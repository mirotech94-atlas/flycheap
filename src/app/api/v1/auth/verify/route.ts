import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeMagicLinkForBearer } from '@/lib/mobileAuth';

export const dynamic = 'force-dynamic';

const Body = z.object({ token: z.string().min(10) });

/**
 * POST /api/v1/auth/verify  { token }
 * Exchanges a magic-link token (arrived via universal link OR custom scheme —
 * the app POSTs the token here regardless of source) for a long-lived mobile
 * Bearer session. Returns { token, expiresAt, user } for expo-secure-store.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const session = consumeMagicLinkForBearer(parsed.data.token);
  if (!session) return NextResponse.json({ error: 'invalid or expired link' }, { status: 401 });

  return NextResponse.json(session);
}

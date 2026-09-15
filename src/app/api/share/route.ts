import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { queries, limitsForUser } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Guard for every method here. This endpoint previously had NO auth at all —
 * an anonymous caller could read the household share token (exposing the
 * shared dashboard) or rotate/delete it (breaking it for everyone).
 * Household sharing is also a paid capability.
 */
async function guard(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: 'sign in required' }, { status: 401 }) };
  }
  if (!limitsForUser(user).familyShare) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'Household sharing is a Pro feature.', upgrade: '/pricing' },
        { status: 402 },
      ),
    };
  }
  return { ok: true };
}

function ensureToken(): string {
  let t = queries.getSetting('share_token') ?? '';
  if (!t) {
    t = crypto.randomBytes(18).toString('base64url');
    queries.setSetting('share_token', t);
  }
  return t;
}

export async function GET() {
  const g = await guard(); if (!g.ok) return g.res;
  return NextResponse.json({ token: ensureToken() });
}

export async function POST() {
  const g = await guard(); if (!g.ok) return g.res;
  // Rotate
  const fresh = crypto.randomBytes(18).toString('base64url');
  queries.setSetting('share_token', fresh);
  return NextResponse.json({ token: fresh });
}

export async function DELETE() {
  const g = await guard(); if (!g.ok) return g.res;
  queries.setSetting('share_token', '');
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

function ensureToken(): string {
  let t = queries.getSetting('share_token') ?? '';
  if (!t) {
    t = crypto.randomBytes(18).toString('base64url');
    queries.setSetting('share_token', t);
  }
  return t;
}

export async function GET() {
  return NextResponse.json({ token: ensureToken() });
}

export async function POST() {
  // Rotate
  const fresh = crypto.randomBytes(18).toString('base64url');
  queries.setSetting('share_token', fresh);
  return NextResponse.json({ token: fresh });
}

export async function DELETE() {
  queries.setSetting('share_token', '');
  return NextResponse.json({ ok: true });
}

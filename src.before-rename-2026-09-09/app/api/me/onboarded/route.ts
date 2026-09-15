import { NextResponse } from 'next/server';
import { queries } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// PUT marks the signed-in user as having completed the onboarding tour.
// Idempotent. The tour reads this state via /api/me on next mount.
export async function PUT() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  queries.setUserSetting(user.id, 'onboarded_v1', String(Date.now()));
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/onboarded — the app calls this once the first-run setup wizard
 * is finished (or skipped). Stored on the ACCOUNT, not the device, so a
 * reinstall or a second phone never re-runs onboarding.
 */
export async function POST(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  queries.setOnboarded(user.id);
  return NextResponse.json({ ok: true });
}

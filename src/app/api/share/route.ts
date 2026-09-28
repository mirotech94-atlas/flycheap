import { NextResponse } from 'next/server';
import { queries } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * RETIRED. This handed any Pro user the single install-wide `share_token`,
 * and /share/<that token> rendered every user's watches. The share page no
 * longer honours it; per-group boards (/org → a group → Boards) replace it,
 * each scoped to its creator's watches, hashed, expiring and revocable.
 *
 * GET/POST answer 410 so an old client sees why; DELETE still clears the
 * stored value so nothing usable lingers in settings.
 */
const GONE = {
  error: 'The single family share link has been retired. Create a board for a group under /org instead.',
  boards: '/org',
};

export async function GET() {
  return NextResponse.json(GONE, { status: 410 });
}

export async function POST() {
  return NextResponse.json(GONE, { status: 410 });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  queries.setSetting('share_token', '');
  return NextResponse.json({ ok: true });
}

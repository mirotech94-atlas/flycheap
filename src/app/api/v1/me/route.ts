import { NextResponse } from 'next/server';
import { apiAuthBearer } from '@/lib/mobileAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me
 * Bearer-authed identity check — the smallest endpoint that proves the mobile
 * auth loop (verify → store token → authed request) end-to-end.
 */
export async function GET(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  // trial_ends_at is SQLite "YYYY-MM-DD HH:MM:SS" (UTC) — normalize to ISO so
  // Date.parse on the app side is unambiguous.
  const trialEndsAt = user.trial_ends_at ? `${user.trial_ends_at.replace(' ', 'T')}Z` : null;
  return NextResponse.json({
    user: {
      id: user.id, email: user.email, name: user.name, tier: user.tier,
      username: user.username ?? null,
      subscriptionStatus: user.subscription_status ?? null,
      trialEndsAt,
    },
  });
}

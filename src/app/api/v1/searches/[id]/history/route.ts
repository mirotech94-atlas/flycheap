import { NextResponse } from 'next/server';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { queries, limitsForUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/searches/:id/history — daily cheapest-per-adult points for the route's price
 * trend chart. Ownership-checked; downsampled to one point/day (from 30-min snapshots).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await ctx.params;
  const searchId = parseInt(id, 10);
  if (!Number.isFinite(searchId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  if (!queries.listSearchesForUser(user.id).some((s) => s.id === searchId)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // History depth is the paid capability: the multi-month series is the one
  // asset providers don't keep (Travelpayouts retains ~7 days, Kayak Explore
  // is a 48-hour snapshot). Free sees a week; paid sees the whole run.
  const limits = limitsForUser(user);
  const points = queries.fareHistoryDaily(searchId, limits.historyDays)
    .map((p) => ({ day: p.day, perAdultUsd: p.per_adult_usd }));
  return NextResponse.json({
    points,
    historyDays: limits.historyDays,
    truncated: limits.historyDays < 365,
  });
}

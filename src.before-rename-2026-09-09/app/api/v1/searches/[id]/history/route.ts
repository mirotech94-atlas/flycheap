import { NextResponse } from 'next/server';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { queries } from '@/lib/db';

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

  const points = queries.fareHistoryDaily(searchId, 60).map((p) => ({ day: p.day, perAdultUsd: p.per_adult_usd }));
  return NextResponse.json({ points });
}

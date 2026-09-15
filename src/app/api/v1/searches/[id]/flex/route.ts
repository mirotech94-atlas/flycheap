import { NextResponse } from 'next/server';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { buildFareBookUrl } from '@/lib/bookUrl';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

function baseFromReq(req: Request): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'flycheap.18dn.com';
  return `${proto}://${host}`;
}

/**
 * GET /api/v1/searches/:id/flex — cheapest nearby departure/return dates (±3 days) for this
 * route, from the best-deals cache. Lets the user shift a day or two to save. Each option
 * carries a booking link (via /go, marker preserved) and savings vs the route's current fare.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await ctx.params;
  const searchId = parseInt(id, 10);
  const search = queries.listSearchesForUser(user.id).find((s) => s.id === searchId);
  if (!search) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const current = queries.latestFare(searchId)?.price_per_adult_usd ?? null;
  const baseUrl = baseFromReq(req);
  const rows = queries.flexDateOptions(search.origin, search.depart_date, search.return_date, 3);

  const options = rows.slice(0, 12).map((r) => ({
    depart_date: r.outbound_date,
    return_date: r.return_date,
    perAdultUsd: r.per_adult_usd,
    isCurrent: r.outbound_date === search.depart_date && r.return_date === search.return_date,
    savingsVsCurrent: current != null ? Math.round(current - r.per_adult_usd) : null,
    bookUrl: buildFareBookUrl({
      origin: search.origin, destination: search.destination,
      dep: r.outbound_date, ret: r.return_date, adults: search.adults,
      perAdultUsd: r.per_adult_usd, baseUrl,
    }),
  }));

  return NextResponse.json({
    origin: search.origin, destination: search.destination,
    currentDepart: search.depart_date, currentReturn: search.return_date, currentPerAdult: current,
    options,
  });
}

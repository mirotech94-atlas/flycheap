import { NextResponse } from 'next/server';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { getCachedBestDeals } from '@/lib/bestDeals';
import { buildFareBookUrl } from '@/lib/bookUrl';

export const dynamic = 'force-dynamic';

function baseFromReq(req: Request): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'flycheap.live';
  return `${proto}://${host}`;
}

/**
 * GET /api/v1/fares?origin=&limit= — best fares worldwide (cached best-deals),
 * each carrying a server-built `bookUrl` (/go link; marker injected at redirect).
 */
export async function GET(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '40', 10) || 40, 1), 100);
  const origin = url.searchParams.get('origin')?.toUpperCase();

  const { deals, refreshed_at } = getCachedBestDeals(limit * 4);
  let list = deals;
  if (origin) list = list.filter((d) => d.origin === origin);
  list = list.slice(0, limit);

  const baseUrl = baseFromReq(req);
  const fares = list.map((d) => ({
    origin: d.origin,
    destination: d.destination,
    depart_date: d.outbound_date,
    return_date: d.return_date,
    perAdultUsd: d.per_adult_usd,
    partyTotalUsd: d.party_total_usd,
    tripLengthDays: d.trip_length_days,
    outboundTransfers: d.outbound_transfers,
    returnTransfers: d.return_transfers,
    provider: d.provider ?? 'aviasales',
    bookUrl: buildFareBookUrl({
      origin: d.origin,
      destination: d.destination,
      dep: d.outbound_date,
      ret: d.return_date,
      adults: 1,
      perAdultUsd: d.per_adult_usd,
      baseUrl,
    }),
  }));

  return NextResponse.json({ fares, refreshedAt: refreshed_at });
}

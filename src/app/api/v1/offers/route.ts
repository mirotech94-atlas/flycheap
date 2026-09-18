import { NextResponse } from 'next/server';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { getCachedBestDeals } from '@/lib/bestDeals';
import { buildFareBookUrl } from '@/lib/bookUrl';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

function baseFromReq(req: Request): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'flycheap.live';
  return `${proto}://${host}`;
}

/**
 * GET /api/v1/offers — mistake-fare radar / standout deals: the cheapest fares,
 * flagged against the user's alert threshold. A curated, lowest-price-first cut
 * of the best-deals cache.
 */
export async function GET(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const threshold = parseFloat(
    queries.getUserSetting(user.id, 'alert_threshold_per_adult_usd') ??
      queries.getSetting('alert_threshold_per_adult_usd') ??
      '900',
  );

  const { deals, refreshed_at } = getCachedBestDeals(400);
  const sorted = [...deals].sort((a, b) => a.per_adult_usd - b.per_adult_usd).slice(0, 30);

  const baseUrl = baseFromReq(req);
  const offers = sorted.map((d) => ({
    origin: d.origin,
    destination: d.destination,
    depart_date: d.outbound_date,
    return_date: d.return_date,
    perAdultUsd: d.per_adult_usd,
    partyTotalUsd: d.party_total_usd,
    tripLengthDays: d.trip_length_days,
    belowThreshold: d.per_adult_usd < threshold,
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

  return NextResponse.json({ offers, threshold, refreshedAt: refreshed_at });
}

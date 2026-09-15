import { NextResponse } from 'next/server';
import { getCachedBestDeals } from '@/lib/bestDeals';

// Hotellook's public cache.json API has been retired for non-partners (every
// variant returns 404 from engine.hotellook.com). Pivoting: we serve a
// month-by-month curve of cheapest cached *flight* prices to the destination
// instead — same chart-shape, more useful for hotel-search timing since flight
// price is the bigger lever for a trip's total cost.
//
// Data source: best_deals_cache (already populated by best-deals + bg-poll
// cron jobs). No external network call.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const location = (url.searchParams.get('location') ?? '').toUpperCase().trim();
  if (!location) return NextResponse.json({ error: 'location required' }, { status: 400 });

  // Pull plenty of cached deals for this destination, then bucket by depart month.
  const { deals } = getCachedBestDeals(500, location);
  if (deals.length === 0) {
    return NextResponse.json({
      ok: true,
      location,
      months: [],
      note: 'No cached flight data for this destination yet. Background polling refreshes the cache hourly.',
    });
  }

  const byMonth = new Map<string, number[]>();
  for (const d of deals) {
    const m = d.outbound_date.slice(0, 7); // YYYY-MM
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(d.per_adult_usd);
  }
  const months = Array.from(byMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, prices]) => {
      const minPrice = Math.round(Math.min(...prices));
      const avgPrice = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
      const [yyyy, mm] = month.split('-');
      const label = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, 1))
        .toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
      return { month, label, minPrice, avgPrice, samples: prices.length };
    });

  return NextResponse.json({
    ok: true,
    location,
    months,
    note: 'Cheapest cached round-trip per-adult flight prices to this destination, bucketed by outbound month.',
  });
}

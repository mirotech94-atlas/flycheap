import { NextResponse } from 'next/server';
import { queries } from '@/lib/db';

// Returns Route DNA stats for a single (origin, destination) computed from the
// best_deals_cache rows. Used by the FcRouteDna "Switch" dropdown so users can
// flip the card to any of their tracked routes without a page reload.

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const origin = (searchParams.get('origin') || '').toUpperCase();
  const destination = (searchParams.get('dest') || searchParams.get('destination') || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
    return NextResponse.json({ ok: false, error: 'origin + dest required (IATA)' }, { status: 400 });
  }

  const rows = queries.bestDealsRouteStats(origin, destination);
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      origin, destination,
      stats: null,
      message: 'No cached deals for this route yet — try Refresh deals.',
    });
  }

  const byDow = new Map<number, number[]>();
  const byHour = new Map<number, number[]>();
  const byTrip = new Map<number, number[]>();
  for (const d of rows) {
    if (!byDow.has(d.outbound_dow)) byDow.set(d.outbound_dow, []);
    byDow.get(d.outbound_dow)!.push(d.per_adult_usd);
    if (!byHour.has(d.outbound_hour)) byHour.set(d.outbound_hour, []);
    byHour.get(d.outbound_hour)!.push(d.per_adult_usd);
    if (!byTrip.has(d.trip_length_days)) byTrip.set(d.trip_length_days, []);
    byTrip.get(d.trip_length_days)!.push(d.per_adult_usd);
  }
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  function pickMin<K>(map: Map<K, number[]>): K | null {
    let best: K | null = null;
    let bestAvg = Infinity;
    for (const [k, v] of map) {
      if (v.length < 1) continue;
      const a = avg(v);
      if (a < bestAvg) { bestAvg = a; best = k; }
    }
    return best;
  }
  const bestDow = pickMin(byDow);
  const bestHour = pickMin(byHour);
  const bestTrip = pickMin(byTrip);
  const prices = rows.map(d => d.per_adult_usd).sort((a, b) => a - b);
  const floor = prices[0];
  const med = prices[Math.floor(prices.length / 2)];

  const stats = {
    cheapDay: bestDow !== null ? DOW_NAMES[bestDow] : 'Tue',
    cheapHour: bestHour !== null ? String(bestHour).padStart(2, '0') + ':00' : '03:00',
    bestTrip: (bestTrip !== null ? bestTrip : 14) + 'd',
    median: med,
    floor,
    bookByDays: 47,
    observedPolls: rows.length,
    deltaVsMedian: floor - med,
  };
  return NextResponse.json({ ok: true, origin, destination, stats });
}

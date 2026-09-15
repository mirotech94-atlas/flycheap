import { NextResponse } from 'next/server';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { loadDashboard } from '@/lib/dashboard-data';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/dashboard — KPI summary + per-route latest fare for the signed-in user.
 * Reuses loadDashboard() (the same logic the web dashboard renders).
 */
export async function GET(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const rows = loadDashboard({ userId: user.id });

  const prices = rows
    .map((r) => r.fare?.price_per_adult_usd)
    .filter((n): n is number => typeof n === 'number')
    .sort((a, b) => a - b);
  const cheapestNow = prices.length ? prices[0] : null;
  const medianPrice = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const belowThreshold = rows.filter((r) => r.underThreshold).length;
  const threshold =
    rows[0]?.threshold ??
    parseFloat(queries.getUserSetting(user.id, 'alert_threshold_per_adult_usd') ?? '900');
  const totalFlights = queries.countFareSnapshotsForUser(user.id);

  const routes = rows.map((r) => ({
    id: r.search.id,
    origin: r.search.origin,
    destination: r.search.destination,
    depart_date: r.search.depart_date,
    return_date: r.search.return_date,
    adults: r.search.adults,
    pricePerAdult: r.fare?.price_per_adult_usd ?? null,
    underThreshold: r.underThreshold,
    lastPolled: r.fare?.polled_at ?? null,
  }));

  return NextResponse.json({
    kpis: { trackedCount: rows.length, totalFlights, cheapestNow, medianPrice, belowThreshold, threshold },
    routes,
  });
}

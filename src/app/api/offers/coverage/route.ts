import { NextResponse } from 'next/server';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ENDPOINT = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';

type TPLeg = { airline: string; departure_at: string; transfers: number; price: number };

/**
 * Survey Travelpayouts cache coverage for an O&D across a range of months.
 * Tells the user "MS has X flights cached for May 2026, 0 for July 2026, ..."
 * so they can pick a month that actually has data.
 */
async function surveyOne(origin: string, destination: string, month: string, token: string, airline: string | null) {
  const params = new URLSearchParams({
    origin, destination, departure_at: month,
    unique: 'false', sorting: 'price', direct: 'false',
    currency: 'usd', limit: '1000', page: '1', one_way: 'true', token,
  });
  const res = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  if (!res.ok) return { month, totalCached: 0, matchingAirline: 0, byDay: {} as Record<string, number>, ok: false, error: `${res.status}` };
  const j = await res.json() as { data?: TPLeg[] };
  const all = j.data ?? [];
  const matched = airline ? all.filter(l => l.airline === airline) : all;
  const byDay: Record<string, number> = {};
  for (const l of matched) {
    const d = l.departure_at.slice(0, 10);
    byDay[d] = (byDay[d] ?? 0) + 1;
  }
  return { month, totalCached: all.length, matchingAirline: matched.length, byDay, ok: true };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const origin = String((body as { origin?: unknown }).origin ?? 'JFK').trim().toUpperCase();
  const destination = String((body as { destination?: unknown }).destination ?? 'CAI').trim().toUpperCase();
  const startMonth = String((body as { startMonth?: unknown }).startMonth ?? new Date().toISOString().slice(0, 7)); // YYYY-MM
  const monthsAhead = Math.max(1, Math.min(12, Number((body as { monthsAhead?: unknown }).monthsAhead ?? 6)));
  const airline = String((body as { airline?: unknown }).airline ?? 'MS').trim().toUpperCase() || null;

  // GUARD: middleware.ts does not run on api/ routes. This endpoint is reached
  // from the PUBLIC offers explorer so it cannot require a session, but every
  // call spends metered Travelpayouts requests — so it is rate limited per IP
  // rather than left open to be used as someone else's quota.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!queries.rateLimitCheck('offers-coverage', ip, 20, 60)) {
    return NextResponse.json({ ok: false, error: 'Too many requests.' }, { status: 429 });
  }

  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: 'TRAVELPAYOUTS_TOKEN not set' }, { status: 500 });

  const [yyyy, mm] = startMonth.split('-').map(Number);
  if (!yyyy || !mm) return NextResponse.json({ ok: false, error: `bad startMonth "${startMonth}", expected YYYY-MM` }, { status: 400 });

  const months: string[] = [];
  for (let i = 0; i < monthsAhead; i++) {
    const m = mm + i;
    const y = yyyy + Math.floor((m - 1) / 12);
    const mo = ((m - 1) % 12) + 1;
    months.push(`${y}-${String(mo).padStart(2, '0')}`);
  }

  const results = await Promise.all(months.map(m => surveyOne(origin, destination, m, token, airline === 'ANY' ? null : airline)));
  return NextResponse.json({ ok: true, origin, destination, airline, months: results });
}

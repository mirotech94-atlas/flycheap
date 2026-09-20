import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/providers';
import { queries } from '@/lib/db';
import { requireOwner } from '@/lib/apiGuard';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  // GUARD: middleware.ts does not run on api/ routes, so this handler is
  // the only thing protecting it. Probes a provider with real, billable API calls.
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const provider = getProvider(id as any);
  if (!provider) return NextResponse.json({ ok: false, error: 'unknown provider' }, { status: 404 });
  if (!provider.isConfigured()) return NextResponse.json({ ok: false, error: provider.configHint }, { status: 400 });

  // Use the first active search if any, else a sensible default.
  const s = queries.listActiveSearches()[0] ?? {
    origin: 'JFK', destination: 'CAI',
    depart_date: '2026-12-20', return_date: '2027-01-05',
    adults: 4, infants: 1,
  };
  const r = await provider.search({
    origin: s.origin, destination: s.destination,
    departDate: s.depart_date, returnDate: s.return_date,
    adults: s.adults, infants: s.infants,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, ms: r.ms, status: r.status });
  return NextResponse.json({
    ok: true,
    offers: r.offers.length,
    cheapest: r.offers[0]?.per_adult_usd?.toFixed(0) ?? null,
    ms: r.ms,
  });
}

import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/offers/queue-alert
 *
 * Called from OffersExplorer when the on-demand poll has been running >60s
 * without results — we hand the route to the background poller and the
 * existing alert pipeline will fire when fares are found.
 *
 * Body: { origin, destination, departDate, returnDate, adults?, infants? }
 * Requires auth — anonymous visitors can't queue persistent watches.
 */
export async function POST(req: Request) {
  const user = await apiAuth();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Sign in to queue a fare watch.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const originRaw = String((body as { origin?: unknown }).origin ?? '').trim().toUpperCase();
  const destination = String((body as { destination?: unknown }).destination ?? '').trim().toUpperCase();
  const departDate = String((body as { departDate?: unknown }).departDate ?? '').trim();
  const returnDate = String((body as { returnDate?: unknown }).returnDate ?? '').trim();
  const adults = Number((body as { adults?: unknown }).adults ?? 1);
  const infants = Number((body as { infants?: unknown }).infants ?? 0);

  // For multi-origin "JFK,EWR" we persist the first; the poller scans by single origin.
  const origin = originRaw.split(',').map(s => s.trim()).filter(Boolean)[0] ?? '';

  if (!origin || !destination) {
    return NextResponse.json({ ok: false, error: 'origin and destination required.' }, { status: 400 });
  }
  if (!ISO_DATE.test(departDate) || !ISO_DATE.test(returnDate)) {
    return NextResponse.json({ ok: false, error: 'Dates must be YYYY-MM-DD.' }, { status: 400 });
  }
  if (returnDate <= departDate) {
    return NextResponse.json({ ok: false, error: 'Return must be after depart.' }, { status: 400 });
  }

  // Per-IP rate cap so a bot can't spam-queue searches.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'anon';
  if (!queries.rateLimitCheck('queue-alert', `${user.id}:${ip}`, 10, 60)) {
    return NextResponse.json({ ok: false, error: 'Rate limit — please wait a minute.' }, { status: 429 });
  }

  const result = queries.insertSearch({
    origin,
    destination,
    depart_date: departDate,
    return_date: returnDate,
    adults: Number.isFinite(adults) && adults > 0 ? adults : 1,
    infants: Number.isFinite(infants) && infants >= 0 ? infants : 0,
    active: 1,
    user_id: user.id,
  });
  const searchId = Number(result.lastInsertRowid);

  // Per-search "notify when first fare lands" flag — read in poller after
  // insertFare. Key convention: notify_when_ready:search:<id>. Cleared by
  // the poller once the ready-alert fires so we don't notify twice.
  queries.setUserSetting(user.id, `notify_when_ready:search:${searchId}`, '1');

  return NextResponse.json({ ok: true, search_id: searchId });
}

import { NextResponse } from 'next/server';
import { searchAllProviders } from '@/lib/providers';
import { getCachedBestDeals } from '@/lib/bestDeals';
import type { StopsPref } from '@/lib/providers/types';

export const dynamic = 'force-dynamic';

function normalizeOrigins(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function maxTransfers(o: { outbound_transfers: number; return_transfers: number }) {
  return Math.max(o.outbound_transfers ?? 0, o.return_transfers ?? 0);
}

function stopsMatch(o: { outbound_transfers: number; return_transfers: number }, filter: StopsPref): boolean {
  const m = maxTransfers(o);
  if (filter === 'nonstop') return m === 0;
  if (filter === 'one-stop') return m === 1;
  if (filter === 'two-plus') return m >= 2;
  return true;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function nearbyDates(iso: string, days: number): string[] {
  const out: string[] = [];
  const base = new Date(iso + 'T00:00:00Z');
  for (let i = -days; i <= days; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime()) / 86400000);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const origins = normalizeOrigins((body as { origin?: unknown }).origin);
  const destination = String((body as { destination?: unknown }).destination ?? 'CAI').trim().toUpperCase() || 'CAI';
  const departDate = String((body as { departDate?: unknown }).departDate ?? '').trim();
  const returnDate = String((body as { returnDate?: unknown }).returnDate ?? '').trim();
  const adults = Number((body as { adults?: unknown }).adults ?? 4);
  const infants = Number((body as { infants?: unknown }).infants ?? 1);
  const stops = (String((body as { stops?: unknown }).stops ?? 'all') as StopsPref) || 'all';
  const airline = String((body as { airline?: unknown }).airline ?? 'MS').trim().toUpperCase() || 'MS';

  // ---- Date / input validation surfaces specific errors so the user can see why
  if (origins.length === 0) {
    return NextResponse.json({ ok: false, error: 'Pick at least one origin (JFK or EWR).' }, { status: 400 });
  }
  if (!ISO_DATE.test(departDate) || !ISO_DATE.test(returnDate)) {
    return NextResponse.json({ ok: false, error: `Dates must be in YYYY-MM-DD form. Got depart="${departDate}", return="${returnDate}".` }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (departDate < today) {
    return NextResponse.json({ ok: false, error: `Depart date ${departDate} is in the past (today is ${today}).` }, { status: 400 });
  }
  if (returnDate <= departDate) {
    return NextResponse.json({ ok: false, error: `Return ${returnDate} must be AFTER depart ${departDate}.` }, { status: 400 });
  }
  if (!Number.isFinite(adults) || adults <= 0) {
    return NextResponse.json({ ok: false, error: 'adults must be ≥ 1.' }, { status: 400 });
  }

  const searches = origins.map(async (origin) => {
    const r = await searchAllProviders({
      origin,
      destination,
      departDate,
      returnDate,
      adults,
      infants: Number.isFinite(infants) && infants >= 0 ? infants : 0,
      stops,
      airline,
    });
    return { origin, ...r };
  });

  const results = await Promise.all(searches);
  const merged = results.flatMap(r => r.offers.map(o => ({ ...o, origin: r.origin })));
  // Defensive double-filter (some providers can't honour stops natively).
  let filtered = merged.filter(o => stopsMatch(o, stops));
  filtered.sort((a, b) => a.per_adult_usd - b.per_adult_usd);

  // ---- Nearest-cached-date fallback ----
  // If no offers match the EXACT requested dates, scan ±7 days on each leg
  // through the same providers and surface the closest pairings. This turns
  // "no offers" into "closest available: depart 5 days later, return 2 days
  // earlier" with one click to apply.
  let fallback: { offers: typeof filtered; window: string } | null = null;
  if (filtered.length === 0) {
    const dates = nearbyDates(departDate, 7);
    const retDates = nearbyDates(returnDate, 7);
    const tries: Array<{ d: string; r: string; absShift: number }> = [];
    for (const d of dates) for (const r of retDates) {
      if (r <= d) continue;
      const shift = Math.abs(daysBetween(d, departDate)) + Math.abs(daysBetween(r, returnDate));
      tries.push({ d, r, absShift: shift });
    }
    // Try the closest 5 alternative date pairs to keep API usage bounded.
    tries.sort((a, b) => a.absShift - b.absShift);
    const candidates = tries.slice(1, 6); // skip [0] = exact match (already failed)
    const fallbackResults: typeof filtered = [];
    for (const c of candidates) {
      const altSearches = origins.map(async (origin) => {
        const r = await searchAllProviders({
          origin, destination,
          departDate: c.d, returnDate: c.r,
          adults, infants: Number.isFinite(infants) && infants >= 0 ? infants : 0,
          stops, airline,
        });
        return { origin, ...r };
      });
      const altR = await Promise.all(altSearches);
      const altMerged = altR.flatMap(r => r.offers.map(o => ({ ...o, origin: r.origin })))
        .filter(o => stopsMatch(o, stops));
      if (altMerged.length > 0) {
        fallbackResults.push(...altMerged);
        if (fallbackResults.length >= 10) break;
      }
    }
    if (fallbackResults.length > 0) {
      fallbackResults.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
      fallback = { offers: fallbackResults.slice(0, 10), window: '±7 days (live API)' };
    }

    // SECOND-tier fallback: tap the daily best-deals 12-month scan cache.
    // This always has SOMETHING (refreshed every 12h by cron) so we can show
    // the closest pairings even when the live providers have no cache for
    // those exact months.
    if (!fallback) {
      const { deals: cached } = getCachedBestDeals(500);
      // The cached best-deals scan covers 12 months but may include non-MS
      // pairings for far-future months where TP only caches other carriers.
      // We surface ALL matching-origin pairings as a "closest available" hint,
      // tagging each offer with its actual airline so the UI can show
      // "EgyptAir not cached for those dates — closest cached: SV (Saudia) $X".
      const matchingOrigin = cached.filter(d => origins.includes(d.origin));
      if (matchingOrigin.length > 0) {
        const scored = matchingOrigin.map(d => ({
          deal: d,
          dist: Math.abs(daysBetween(d.outbound_date, departDate)) + Math.abs(daysBetween(d.return_date, returnDate)),
        }));
        scored.sort((a, b) => a.dist - b.dist);
        const top = scored.slice(0, 8);
        const fakeOffers = top.map(s => {
          const d = s.deal;
          const total = d.per_adult_usd * adults + d.per_adult_usd * 0.10 * (Number.isFinite(infants) ? infants : 0);
          return {
            provider: 'travelpayouts' as const,
            origin: d.origin,
            per_adult_usd: d.per_adult_usd,
            total_party_usd: total,
            outbound_flight_no: d.outbound_flight_no,
            return_flight_no: d.return_flight_no,
            outbound_depart_iso: `${d.outbound_date}T${String(d.outbound_hour).padStart(2,'0')}:00:00`,
            return_depart_iso: `${d.return_date}T${String(d.return_hour).padStart(2,'0')}:00:00`,
            outbound_transfers: d.outbound_transfers,
            return_transfers: d.return_transfers,
            airline: (d.outbound_flight_no || '').slice(0, 2).toUpperCase() || 'MS',
            raw: { source: 'best-deals-cache', distance_days: s.dist },
          };
        });
        fallback = { offers: fakeOffers, window: 'closest match in 12-month best-deals cache' };
      }
    }
  }

  // Build a per-provider diagnostic so the UI can show "why no offers".
  const provider_results = results.flatMap(r => r.results.map(pr => ({
    origin: r.origin,
    ...pr,
    // Don't ship the raw offer list back — too heavy
    offers: 'offers' in pr ? pr.offers.length : undefined,
  })));

  // Per-provider summary for the diagnostic banner
  const summary = provider_results.map(pr =>
    pr.ok
      ? `${pr.provider}/${pr.origin}: ${pr.offers ?? 0} offers in ${pr.ms}ms${pr.note ? ` — ${pr.note}` : ''}`
      : `${pr.provider}/${pr.origin}: ERROR ${pr.status} — ${pr.error}`
  );

  return NextResponse.json({
    ok: true,
    count: filtered.length,
    offers: filtered,
    fallback: fallback ? {
      window: fallback.window,
      offers: fallback.offers.map(o => ({
        ...o,
        // Annotate so the UI can show "Move depart 5 days later, return 2 days earlier"
        suggested_depart_shift_days: o.outbound_depart_iso ? daysBetween(o.outbound_depart_iso.slice(0,10), departDate) : null,
        suggested_return_shift_days: o.return_depart_iso ? daysBetween(o.return_depart_iso.slice(0,10), returnDate) : null,
      })),
    } : null,
    echo: { origin: origins.join(','), destination, departDate, returnDate, adults, infants, stops, airline },
    provider_results,
    summary,
  });
}

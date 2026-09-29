import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { searchAllProviders } from '@/lib/providers';
import { getCachedBestDeals } from '@/lib/bestDeals';
import type { StopsPref } from '@/lib/providers/types';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

// ---- On-demand poll cache (in-memory, single-process) ----
// When the synchronous provider call exceeds the SYNC_BUDGET_MS, the route
// returns { status: 'polling', poll_id } and the work continues in the
// background. The client then GETs /api/offers?poll_id=... every few seconds to
// retrieve the result. Entries auto-expire after 5 minutes.
type PollEntry =
  | { status: 'polling'; createdAt: number }
  | { status: 'ready'; createdAt: number; payload: unknown };
const POLL_CACHE = new Map<string, PollEntry>();
const POLL_TTL_MS = 5 * 60 * 1000;
const SYNC_BUDGET_MS = 1800;

function prunePollCache() {
  const now = Date.now();
  for (const [k, v] of POLL_CACHE) {
    if (now - v.createdAt > POLL_TTL_MS) POLL_CACHE.delete(k);
  }
}

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'anon';
}

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

// GET /api/offers?poll_id=... — retrieve a queued on-demand poll result.
export async function GET(req: Request) {
  prunePollCache();
  const url = new URL(req.url);
  const pollId = url.searchParams.get('poll_id');
  if (!pollId) {
    return NextResponse.json({ ok: false, error: 'poll_id required' }, { status: 400 });
  }
  const entry = POLL_CACHE.get(pollId);
  if (!entry) {
    return NextResponse.json({ ok: false, error: 'poll_id not found or expired', status: 'expired' }, { status: 404 });
  }
  if (entry.status === 'polling') {
    return NextResponse.json({ ok: true, status: 'polling', poll_id: pollId });
  }
  return NextResponse.json({ ok: true, status: 'ready', poll_id: pollId, ...(entry.payload as Record<string, unknown>) });
}

async function runSearch(params: {
  origins: string[];
  destination: string;
  departDate: string;
  returnDate: string;
  adults: number;
  infants: number;
  stops: StopsPref;
  airline: string;
}): Promise<Record<string, unknown>> {
  const { origins, destination, departDate, returnDate, adults, infants, stops, airline } = params;

  const searches = origins.map(async (origin) => {
    const r = await searchAllProviders({
      origin, destination, departDate, returnDate, adults,
      infants: Number.isFinite(infants) && infants >= 0 ? infants : 0,
      stops, airline,
    });
    return { origin, ...r };
  });

  const results = await Promise.all(searches);
  const merged = results.flatMap(r => r.offers.map(o => ({ ...o, origin: r.origin })));
  const filtered = merged.filter(o => stopsMatch(o, stops));
  filtered.sort((a, b) => a.per_adult_usd - b.per_adult_usd);

  let fallback: { offers: typeof filtered; window: string } | null = null;
  let freshly_polled = false;
  if (filtered.length === 0) {
    // On-demand re-poll: the initial searchAllProviders call IS the live fetch
    // (Travelpayouts + SerpAPI when configured). If it came back empty, walk
    // ±7 days and the best-deals cache to surface SOMETHING.
    freshly_polled = true;
    const dates = nearbyDates(departDate, 7);
    const retDates = nearbyDates(returnDate, 7);
    const tries: Array<{ d: string; r: string; absShift: number }> = [];
    for (const d of dates) for (const r of retDates) {
      if (r <= d) continue;
      const shift = Math.abs(daysBetween(d, departDate)) + Math.abs(daysBetween(r, returnDate));
      tries.push({ d, r, absShift: shift });
    }
    tries.sort((a, b) => a.absShift - b.absShift);
    const candidates = tries.slice(1, 6);
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

    if (!fallback) {
      const { deals: cached } = getCachedBestDeals(500);
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

  const provider_results = results.flatMap(r => r.results.map(pr => ({
    origin: r.origin,
    ...pr,
    offers: 'offers' in pr ? pr.offers.length : undefined,
  })));

  const summary = provider_results.map(pr =>
    pr.ok
      ? `${pr.provider}/${pr.origin}: ${pr.offers ?? 0} offers in ${pr.ms}ms${pr.note ? ` — ${pr.note}` : ''}`
      : `${pr.provider}/${pr.origin}: ERROR ${pr.status} — ${pr.error}`
  );

  return {
    ok: true,
    count: filtered.length,
    offers: filtered,
    freshly_polled,
    fallback: fallback ? {
      window: fallback.window,
      offers: fallback.offers.map(o => ({
        ...o,
        suggested_depart_shift_days: o.outbound_depart_iso ? daysBetween(o.outbound_depart_iso.slice(0,10), departDate) : null,
        suggested_return_shift_days: o.return_depart_iso ? daysBetween(o.return_depart_iso.slice(0,10), returnDate) : null,
      })),
    } : null,
    echo: { origin: origins.join(','), destination, departDate, returnDate, adults, infants, stops, airline },
    provider_results,
    summary,
  };
}

export async function POST(req: Request) {
  prunePollCache();
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

  // Rate limit on-demand polls per IP — 5 per minute. Keeps a refreshing
  // browser from hammering Travelpayouts / SerpAPI quotas.
  const ip = clientIp(req);
  if (!queries.rateLimitCheck('offers-ondemand', ip, 5, 60)) {
    return NextResponse.json({
      ok: false,
      error: 'Too many on-demand polls — please wait a minute before retrying.',
      status: 'rate-limited',
    }, { status: 429 });
  }

  const work = runSearch({
    origins, destination, departDate, returnDate, adults,
    infants: Number.isFinite(infants) && infants >= 0 ? infants : 0,
    stops, airline,
  });

  // Race against a short sync budget. If the providers respond fast, return
  // results inline. Otherwise return { status: 'polling', poll_id } and let
  // the background promise finish + cache its result for GET retrieval.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'__TIMEOUT__'>(resolve => {
    timer = setTimeout(() => resolve('__TIMEOUT__'), SYNC_BUDGET_MS);
  });

  const raced = await Promise.race([work, timeout]);
  if (timer) clearTimeout(timer);

  if (raced === '__TIMEOUT__') {
    const pollId = randomUUID();
    POLL_CACHE.set(pollId, { status: 'polling', createdAt: Date.now() });
    // Background-finish — write result into the cache when ready.
    work.then(payload => {
      POLL_CACHE.set(pollId, { status: 'ready', createdAt: Date.now(), payload });
    }).catch(err => {
      POLL_CACHE.set(pollId, {
        status: 'ready', createdAt: Date.now(),
        payload: { ok: false, error: (err as Error).message ?? 'background poll failed' },
      });
    });
    return NextResponse.json({
      ok: true,
      status: 'polling',
      poll_id: pollId,
      message: 'Pulling fresh prices from providers — poll GET /api/offers?poll_id every few seconds.',
    });
  }

  return NextResponse.json({ ...raced, status: 'ready' });
}

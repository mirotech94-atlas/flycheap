import { NextResponse } from 'next/server';
import { refreshBestDeals, getCachedBestDeals } from '@/lib/bestDeals';
import { requireUser } from '@/lib/apiGuard';

export const maxDuration = 60;

type RefreshState = {
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  count: number | null;
  error: string | null;
};

declare global {
  // eslint-disable-next-line no-var -- `declare global` requires var
  var __flycheapBestDealsRefresh: RefreshState | undefined;
}

function state(): RefreshState {
  if (!globalThis.__flycheapBestDealsRefresh) {
    globalThis.__flycheapBestDealsRefresh = {
      running: false,
      startedAt: null,
      finishedAt: null,
      count: null,
      error: null,
    };
  }
  return globalThis.__flycheapBestDealsRefresh;
}

export async function GET() {
  // Deliberately public, and it stays that way: `destinations/[slug]` renders
  // these same rows server-side on pages anyone can read, so gating the JSON
  // would protect nothing. See INTENTIONALLY_PUBLIC in tests/api-auth.test.ts.
  //
  // The POST below is a different question — it spends money.
  // Dashboard filtering expects a larger cache for month/stop filtering.
  return NextResponse.json({ ...getCachedBestDeals(5000), refresh: state() });
}

export async function POST(req: Request) {
  // This one spends money. refreshBestDeals() fans out to the fare providers
  // and every call writes an api_calls row with its cost, so an unguarded POST
  // let anyone burn the Travelpayouts quota — and the 202 "already running"
  // reply made it trivially repeatable. Guarded for cost, not just privacy.
  // `req` is passed so the guard's same-origin check runs: on a mutation a
  // session cookie alone is not consent, and tests/api-auth.test.ts enforces
  // that every mutating handler hands its request over.
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const s = state();
  if (s.running) {
    return NextResponse.json({ ok: true, status: 'running', refresh: s }, { status: 202 });
  }

  s.running = true;
  s.startedAt = Date.now();
  s.finishedAt = null;
  s.count = null;
  s.error = null;

  refreshBestDeals().then(results => {
    const total = results.reduce((s, r) => s + r.count, 0);
    const current = state();
    current.running = false;
    current.finishedAt = Date.now();
    current.count = total;
    current.error = null;
  }).catch(e => {
    const current = state();
    current.running = false;
    current.finishedAt = Date.now();
    current.error = (e as Error).message;
  });

  return NextResponse.json({ ok: true, status: 'queued', refresh: s }, { status: 202 });
}

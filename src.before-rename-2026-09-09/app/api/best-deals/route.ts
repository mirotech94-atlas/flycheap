import { NextResponse } from 'next/server';
import { refreshBestDeals, getCachedBestDeals } from '@/lib/bestDeals';

export const maxDuration = 60;

type RefreshState = {
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  count: number | null;
  error: string | null;
};

declare global {
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
  // Dashboard filtering expects a larger cache for month/stop filtering.
  return NextResponse.json({ ...getCachedBestDeals(5000), refresh: state() });
}

export async function POST() {
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

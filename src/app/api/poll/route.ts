import { NextResponse } from 'next/server';
import { pollAll, pollSearch } from '@/lib/poller';
import { requireUser } from '@/lib/apiGuard';

type PollState = {
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  count: number | null;
  error: string | null;
};

declare global {
  // eslint-disable-next-line no-var -- `declare global` requires var
  var __flycheapPollAll: PollState | undefined;
}

function state(): PollState {
  if (!globalThis.__flycheapPollAll) {
    globalThis.__flycheapPollAll = {
      running: false,
      startedAt: null,
      finishedAt: null,
      count: null,
      error: null,
    };
  }
  return globalThis.__flycheapPollAll;
}

export async function GET() {
  // GUARD: middleware.ts does not run on api/ routes, so this handler is
  // the only thing protecting it. Triggers provider polling, which costs money per call.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  return NextResponse.json({ poll: state() });
}

export async function POST(req: Request) {
  // GUARD: middleware.ts does not run on api/ routes, so this handler is
  // the only thing protecting it. Triggers provider polling, which costs money per call.
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const id = url.searchParams.get('search_id');
  if (id) {
    const r = await pollSearch(parseInt(id, 10));
    if (!r) return NextResponse.json({ error: 'search not found' }, { status: 404 });
    return NextResponse.json({ result: r });
  }

  if (url.searchParams.get('background') === '1') {
    const s = state();
    if (s.running) {
      return NextResponse.json({ ok: true, status: 'running', poll: s }, { status: 202 });
    }
    s.running = true;
    s.startedAt = Date.now();
    s.finishedAt = null;
    s.count = null;
    s.error = null;
    pollAll().then(results => {
      const current = state();
      current.running = false;
      current.finishedAt = Date.now();
      current.count = results.length;
      current.error = null;
    }).catch(e => {
      const current = state();
      current.running = false;
      current.finishedAt = Date.now();
      current.error = (e as Error).message;
    });
    return NextResponse.json({ ok: true, status: 'queued', poll: s }, { status: 202 });
  }

  const results = await pollAll();
  return NextResponse.json({ results });
}

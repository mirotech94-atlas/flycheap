import { NextRequest } from 'next/server';
import { queries } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Long-lived Server-Sent Events stream.
//   GET /api/events
//     → text/event-stream, keepalive, JSON-encoded events:
//         event: snapshot   data: {search_id, origin, destination, price_per_adult_usd, polled_at}
//         event: alert      data: {search_id, kind, price_per_adult_usd, sent_at}
//         event: ping       data: {now}                 (every 25s — proxy keepalive)
//
// Client side: new EventSource('/api/events') — auto-reconnects.
//
// Polling cadence is 2s — kept low because SQLite reads are cheap and we
// only return rows that arrived AFTER the previous tick. For each connected
// client we track the last seen snapshot/alert id, so each tick emits only
// new rows.
//
// Scoped to the signed-in user's own searches. Unauthenticated visitors get
// a 401 immediately.

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response('unauthenticated', { status: 401 });

  // Initial cursor = current max ids → first event delivers nothing old.
  const firstSnap = (queries.maxSnapshotId() ?? 0);
  const firstAlert = (queries.maxAlertId() ?? 0);

  let lastSnapId = firstSnap;
  let lastAlertId = firstAlert;
  let closed = false;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      function send(event: string, data: unknown) {
        if (closed) return;
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try { controller.enqueue(enc.encode(payload)); } catch { closed = true; }
      }

      // Hello.
      send('hello', { user_id: user.id, cursor: { snap: lastSnapId, alert: lastAlertId } });

      // Heartbeat — every 25s. Keeps Caddy + browsers from dropping idle stream.
      const heart = setInterval(() => send('ping', { now: Date.now() }), 25_000);

      // Poll loop — every 2s. Only the user's own rows.
      const tick = setInterval(() => {
        try {
          const newSnaps = queries.snapshotsAfterForUser(lastSnapId, user.id, 50);
          for (const s of newSnaps) {
            lastSnapId = Math.max(lastSnapId, s.id);
            send('snapshot', s);
          }
          const newAlerts = queries.alertsAfterForUser(lastAlertId, user.id, 50);
          for (const a of newAlerts) {
            lastAlertId = Math.max(lastAlertId, a.id);
            send('alert', a);
          }
        } catch (e) {
          send('error', { message: (e as Error).message });
        }
      }, 2_000);

      // Cleanup if the client disconnects.
      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(heart);
        clearInterval(tick);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

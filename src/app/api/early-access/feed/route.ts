import { NextResponse } from 'next/server';
import { getFeedPool } from '@/lib/early-access';

export const dynamic = 'force-dynamic';

/**
 * Public: a shuffled pool of real best fares for the marketing + dashboard
 * live feeds. Polled every few seconds by both, so this must never be cached
 * by the browser (a `max-age` here would silently defeat that cadence) —
 * `getFeedPool` carries its own short in-process cache instead, to protect
 * the DB from a burst of clients.
 */
export function GET() {
  return NextResponse.json({ ok: true, items: getFeedPool(40) }, { headers: { 'Cache-Control': 'no-store' } });
}

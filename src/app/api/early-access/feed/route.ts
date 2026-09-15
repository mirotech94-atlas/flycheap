import { NextResponse } from 'next/server';
import { getFeedPool } from '@/lib/early-access';

export const dynamic = 'force-dynamic';

/** Public: a shuffled pool of real best fares for the marketing live feed. */
export function GET() {
  return NextResponse.json({ ok: true, items: getFeedPool(40) }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}

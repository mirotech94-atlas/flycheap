import { NextResponse } from 'next/server';
import { refreshBestDeals, getCachedBestDeals } from '@/lib/bestDeals';

export const maxDuration = 60;

export async function GET() {
  // Dashboard filtering expects a larger cache for month/stop filtering.
  return NextResponse.json(getCachedBestDeals(5000));
}

export async function POST() {
  try {
    const deals = await refreshBestDeals();
    return NextResponse.json({ ok: true, count: deals.length, top3: deals.slice(0, 3) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

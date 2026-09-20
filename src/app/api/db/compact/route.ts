import { NextResponse } from 'next/server';
import { queries } from '@/lib/db';
import { requireOwner } from '@/lib/apiGuard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // GUARD: middleware.ts does not run on api/ routes, so this handler is the
  // only thing protecting it. This deletes fare snapshots, and the price
  // history IS the product — every verdict, every 30-day range and every
  // savings figure is computed from it. It dropped them on an anonymous POST.
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('keepDays') ?? '30', 10);
  const safe = Number.isInteger(days) && days >= 7 && days <= 365 ? days : 30;
  try {
    const stats = queries.compactSnapshots(safe);
    return NextResponse.json({ ok: true, ...stats, keepDetailDays: safe });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

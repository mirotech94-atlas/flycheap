import { NextResponse } from 'next/server';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
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

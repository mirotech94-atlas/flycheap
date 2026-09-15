import { NextResponse } from 'next/server';
import { buildLiveFeed } from '@/lib/liveFeed';

export const dynamic = 'force-dynamic';

export async function GET() {
  const items = buildLiveFeed(20);
  return NextResponse.json({ items });
}

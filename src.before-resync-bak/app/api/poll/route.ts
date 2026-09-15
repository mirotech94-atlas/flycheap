import { NextResponse } from 'next/server';
import { pollAll, pollSearch } from '@/lib/poller';

export async function POST(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('search_id');
  if (id) {
    const r = await pollSearch(parseInt(id, 10));
    if (!r) return NextResponse.json({ error: 'search not found' }, { status: 404 });
    return NextResponse.json({ result: r });
  }
  const results = await pollAll();
  return NextResponse.json({ results });
}

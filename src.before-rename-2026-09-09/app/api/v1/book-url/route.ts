import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { buildFareBookUrl } from '@/lib/bookUrl';

export const dynamic = 'force-dynamic';

const Query = z.object({
  origin: z.string().min(3).max(3),
  destination: z.string().min(3).max(3),
  dep: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ret: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(9).default(1),
  per: z.coerce.number().optional(),
  search_id: z.coerce.number().int().optional(),
});

function baseFromReq(req: Request): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'flycheap.18dn.com';
  return `${proto}://${host}`;
}

/**
 * GET /api/v1/book-url — the canonical affiliate booking URL for a fare.
 * Single source of truth: the app never builds Aviasales URLs itself; the
 * Travelpayouts marker is injected server-side by /go at redirect time.
 */
export async function GET(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const bookUrl = buildFareBookUrl({
    origin: d.origin.toUpperCase(),
    destination: d.destination.toUpperCase(),
    dep: d.dep,
    ret: d.ret,
    adults: d.adults,
    perAdultUsd: d.per ?? null,
    searchId: d.search_id ?? null,
    baseUrl: baseFromReq(req),
  });
  return NextResponse.json({ url: bookUrl });
}

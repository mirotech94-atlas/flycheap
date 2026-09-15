import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { queries, TIER_LIMITS } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GET /api/v1/searches — the user's tracked routes (with latest fare summary). */
export async function GET(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const searches = queries.listSearchesForUser(user.id).map((s) => {
    const fare = queries.latestFare(s.id);
    return {
      id: s.id,
      origin: s.origin,
      destination: s.destination,
      depart_date: s.depart_date,
      return_date: s.return_date,
      adults: s.adults,
      infants: s.infants,
      active: s.active === 1,
      pricePerAdult: fare?.price_per_adult_usd ?? null,
      lastPolled: fare?.polled_at ?? null,
      targetPerAdult: s.target_per_adult_usd ?? null,
      outboundFlightNo: fare?.outbound_flight_no ?? null,
      returnFlightNo: fare?.return_flight_no ?? null,
      tripLengthDays: Math.round(
        (new Date(s.return_date).getTime() - new Date(s.depart_date).getTime()) / 86_400_000,
      ),
    };
  });
  return NextResponse.json({ searches });
}

const PostSchema = z.object({
  origin: z.string().min(3).max(3),
  destination: z.string().min(3).max(3),
  depart_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(9).default(1),
  infants: z.number().int().min(0).max(4).default(0),
});

/** POST /api/v1/searches — create a watch (tier-capped, same as the web flow). */
export async function POST(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const days =
    (new Date(parsed.data.return_date).getTime() - new Date(parsed.data.depart_date).getTime()) / 86_400_000;
  if (days <= 0) return NextResponse.json({ error: 'return_date must be after depart_date' }, { status: 400 });
  if (days > 62) return NextResponse.json({ error: `trip is ${Math.round(days)} days; max 62` }, { status: 400 });

  const limit = TIER_LIMITS[user.tier] ?? TIER_LIMITS.free;
  if (queries.countActiveSearchesForUser(user.id) >= limit.maxRoutes) {
    return NextResponse.json(
      { error: `You're at the ${user.tier} limit of ${limit.maxRoutes} routes. Upgrade to Pro for unlimited.` },
      { status: 403 },
    );
  }

  const result = queries.insertSearch({
    ...parsed.data,
    origin: parsed.data.origin.toUpperCase(),
    destination: parsed.data.destination.toUpperCase(),
    user_id: user.id,
  } as Parameters<typeof queries.insertSearch>[0]);

  return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}

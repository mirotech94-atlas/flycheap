import { NextResponse } from 'next/server';
import { z } from 'zod';
import { queries, TIER_LIMITS } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ searches: [] }, { status: 401 });
  return NextResponse.json({ searches: queries.listSearchesForUser(user.id) });
}

const PostSchema = z.object({
  origin: z.string().min(3).max(3),
  destination: z.string().default('CAI'),
  depart_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(9).default(4),
  infants: z.number().int().min(0).max(4).default(1),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const days = (new Date(parsed.data.return_date).getTime() - new Date(parsed.data.depart_date).getTime()) / 86_400_000;
  if (days <= 0) return NextResponse.json({ error: 'return_date must be after depart_date' }, { status: 400 });
  if (days > 62) return NextResponse.json({ error: `trip is ${Math.round(days)} days; max 62 days (2 months)` }, { status: 400 });

  // Tier cap — block at the free-tier ceiling and surface a clear upgrade prompt.
  const limit = TIER_LIMITS[user.tier] ?? TIER_LIMITS.free;
  const current = queries.countActiveSearchesForUser(user.id);
  if (current >= limit.maxRoutes) {
    return NextResponse.json({
      error: `You're at the ${user.tier} tier limit of ${limit.maxRoutes} active routes. Pause one or upgrade to Pro for unlimited.`,
      upgrade_url: '/api/billing/checkout?plan=pro',
    }, { status: 403 });
  }

  const result = queries.insertSearch({
    ...parsed.data,
    origin: parsed.data.origin.toUpperCase(),
    destination: parsed.data.destination.toUpperCase(),
    user_id: user.id,
  } as Parameters<typeof queries.insertSearch>[0]);
  return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}

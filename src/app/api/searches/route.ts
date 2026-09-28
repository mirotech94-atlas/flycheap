import { NextResponse } from 'next/server';
import { z } from 'zod';
import { queries, limitsForUser, routeLimitError } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ searches: [] }, { status: 401 });
  return NextResponse.json({ searches: queries.listSearchesForUser(user.id) });
}

const PostSchema = z.object({
  origin: z.string().min(3).max(3),
  destination: z.string().length(3).regex(/^[A-Za-z]{3}$/).default('CAI'),
  // Optional when date_mode = 'any' — we then find the cheapest window ourselves.
  depart_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_mode: z.enum(['exact', 'any']).default('exact'),
  adults: z.number().int().min(1).max(9).default(4),
  infants: z.number().int().min(0).max(4).default(1),
  // Optional per-route alert target (per adult, USD). Absent → the user's
  // Settings threshold, then the global default.
  target_per_adult_usd: z.number().positive().max(50000).nullable().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Same cap the mobile API enforces; without it the web API let any account
  // track unlimited routes, each one a paid provider poll on a schedule.
  const overLimit = routeLimitError(user);
  if (overLimit) return NextResponse.json({ error: overLimit, upgrade: '/pricing' }, { status: 403 });

  const mode = parsed.data.date_mode;
  // "Any dates" scans a whole window instead of one date pair — materially more
  // polling per route, and one of the few things no free competitor ties to a
  // user-set target price. Pro (and the founding trial) only.
  if (mode === 'any' && !limitsForUser(user).anyDates) {
    return NextResponse.json({
      error: 'Flexible "any dates" tracking is a Pro feature.',
      upgrade: '/pricing',
    }, { status: 402 });
  }
  let depart = parsed.data.depart_date;
  let ret = parsed.data.return_date;

  if (mode === 'exact') {
    if (!depart || !ret) {
      return NextResponse.json({ error: 'depart_date and return_date are required unless date_mode is "any"' }, { status: 400 });
    }
    const days = (new Date(ret).getTime() - new Date(depart).getTime()) / 86_400_000;
    if (days <= 0) return NextResponse.json({ error: 'return_date must be after depart_date' }, { status: 400 });
    if (days > 62) return NextResponse.json({ error: `trip is ${Math.round(days)} days; max 62 days (2 months)` }, { status: 400 });
  } else {
    // Placeholder pair keeps the NOT NULL columns satisfied; the poller ignores
    // them entirely for any-dates routes.
    const d = new Date(); d.setUTCDate(d.getUTCDate() + 30);
    const r = new Date(); r.setUTCDate(r.getUTCDate() + 37);
    depart = d.toISOString().slice(0, 10);
    ret = r.toISOString().slice(0, 10);
  }

  const result = queries.insertSearch({
    ...parsed.data,
    origin: parsed.data.origin.toUpperCase(),
    destination: parsed.data.destination.toUpperCase(),
    depart_date: depart,
    return_date: ret,
    date_mode: mode,
    user_id: user.id,
  } as Parameters<typeof queries.insertSearch>[0]);
  return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}

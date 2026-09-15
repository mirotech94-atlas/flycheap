import { NextResponse } from 'next/server';
import { z } from 'zod';
import { queries } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const Body = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  queries.reorderSearches(user.id, parsed.data.ids);
  return NextResponse.json({ ok: true });
}

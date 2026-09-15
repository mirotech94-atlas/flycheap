import { NextResponse } from 'next/server';
import { z } from 'zod';
import { queries } from '@/lib/db';

const PatchSchema = z.object({
  active: z.union([z.literal(0), z.literal(1)]).optional(),
  snooze_days: z.number().int().min(0).max(365).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const numId = parseInt(id, 10);
  if (parsed.data.active !== undefined) {
    queries.setSearchActive(numId, parsed.data.active);
  }
  if (parsed.data.snooze_days !== undefined) {
    if (parsed.data.snooze_days === 0) {
      queries.setSearchSnooze(numId, null);
    } else {
      const until = new Date();
      until.setUTCDate(until.getUTCDate() + parsed.data.snooze_days);
      queries.setSearchSnooze(numId, until.toISOString().slice(0, 19).replace('T', ' '));
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  queries.deleteSearch(parseInt(id, 10));
  return NextResponse.json({ ok: true });
}

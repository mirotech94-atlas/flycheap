import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Confirm the search exists AND belongs to the caller (v1 is multi-user). */
async function ownedSearchId(req: Request, idStr: string): Promise<{ id: number; userId: number } | null> {
  const user = await apiAuthBearer(req);
  if (!user) return null;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return null;
  const owns = queries.listSearchesForUser(user.id).some((s) => s.id === id);
  return owns ? { id, userId: user.id } : null;
}

const PatchSchema = z.object({
  active: z.boolean().optional(),
  snooze_days: z.number().int().min(0).max(365).optional(),
  // Per-route alert target. A number sets it; null clears it (falls back to the account default).
  target_per_adult_usd: z.number().min(1).max(100000).nullable().optional(),
});

/** PATCH /api/v1/searches/:id — pause/resume or snooze a watch. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const owned = await ownedSearchId(req, id);
  if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.active !== undefined) queries.setSearchActive(owned.id, parsed.data.active ? 1 : 0);
  if (parsed.data.target_per_adult_usd !== undefined) queries.setSearchTarget(owned.id, parsed.data.target_per_adult_usd);
  if (parsed.data.snooze_days !== undefined) {
    if (parsed.data.snooze_days === 0) {
      queries.setSearchSnooze(owned.id, null);
    } else {
      const until = new Date();
      until.setUTCDate(until.getUTCDate() + parsed.data.snooze_days);
      queries.setSearchSnooze(owned.id, until.toISOString().slice(0, 19).replace('T', ' '));
    }
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/v1/searches/:id — remove a watch. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const owned = await ownedSearchId(req, id);
  if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 });
  queries.deleteSearch(owned.id);
  return NextResponse.json({ ok: true });
}

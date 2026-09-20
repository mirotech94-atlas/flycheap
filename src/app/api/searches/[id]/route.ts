import { NextResponse } from 'next/server';
import { z } from 'zod';
import { queries } from '@/lib/db';
import { requireUser } from '@/lib/apiGuard';
import { isOwner } from '@/lib/auth';
import type { UserRow } from '@/lib/db';

/**
 * Is this search the caller's to change?
 *
 * Neither verb checked this, and neither checked for a session at all — so a
 * route id is an integer anyone could guess, and DELETE removed someone else's
 * tracked route along with its entire price history. Returns 404 rather than
 * 403 for a route that exists but is not theirs: the difference between the
 * two answers is itself a way to enumerate other accounts' routes.
 */
function ownedBy(searchId: number, user: UserRow): boolean {
  if (!Number.isFinite(searchId)) return false;
  const row = queries.getSearchById(searchId);
  if (!row) return false;
  if (isOwner(user)) return true;
  // A legacy row with no owner predates per-account routes; only the owner of
  // the service may touch those, never an arbitrary signed-in account.
  return row.user_id != null && row.user_id === user.id;
}

const PatchSchema = z.object({
  active: z.union([z.literal(0), z.literal(1)]).optional(),
  snooze_days: z.number().int().min(0).max(365).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!ownedBy(parseInt(id, 10), auth.user)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

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

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { id: ownedId } = await ctx.params;
  if (!ownedBy(parseInt(ownedId, 10), auth.user)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const { id } = await ctx.params;
  queries.deleteSearch(parseInt(id, 10));
  return NextResponse.json({ ok: true });
}

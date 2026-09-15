import { NextResponse } from 'next/server';
import { z } from 'zod';
import { queries, getDb } from '@/lib/db';
import { getCurrentUser, isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  tier: z.enum(['free', 'pro', 'enterprise']).optional(),
  subscription_status: z.enum(['active', 'trialing', 'past_due', 'unpaid', 'canceled']).nullable().optional(),
});

async function gate() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  if (!isAdmin(user)) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { user };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ('error' in g) return g.error;
  const { id } = await ctx.params;
  const numId = parseInt(id, 10);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const target = queries.getUserById(numId);
  if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const before = { tier: target.tier, status: target.subscription_status };
  if (parsed.data.tier) {
    queries.setUserTier(numId, parsed.data.tier, parsed.data.subscription_status ?? target.subscription_status ?? undefined);
  }

  queries.insertAudit({
    user_id: g.user.id, email: g.user.email,
    action: 'admin.user.patch', entity: `user:${numId}`,
    detail: { target_email: target.email, before, after: parsed.data },
    ip: req.headers.get('x-forwarded-for') ?? null,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ('error' in g) return g.error;
  const { id } = await ctx.params;
  const numId = parseInt(id, 10);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  if (numId === g.user.id) {
    return NextResponse.json({ error: 'cannot delete yourself' }, { status: 400 });
  }

  const target = queries.getUserById(numId);
  if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const routes = (getDb().prepare(`SELECT COUNT(*) AS n FROM searches WHERE user_id = ?`).get(numId) as { n: number }).n;
  queries.deleteUserCascade(numId);
  queries.insertAudit({
    user_id: g.user.id, email: g.user.email,
    action: 'admin.user.delete', entity: `user:${numId}`,
    detail: { deleted_email: target.email, deleted_tier: target.tier },
    ip: req.headers.get('x-forwarded-for') ?? null,
  });
  import('@/lib/notifier')
    .then(m => m.notifyAccountDeletedToSlack(target, {
      by: 'admin', byEmail: g.user.email, routes,
      ip: (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null,
    }))
    .catch(() => { /* non-critical */ });
  return NextResponse.json({ ok: true });
}

'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { getDb, queries, TIER_LIMITS } from '@/lib/db';

export type RowActionState = { ok?: string; error?: string } | null;

/** Same owner gate the per-user page uses: every mutation here changes what a
 *  real customer receives, so it is owner-only and written to the audit log. */
async function guard(): Promise<{ actorId: number; actorEmail: string; ip: string | null } | { error: string }> {
  const actor = await getCurrentUser();
  if (!isOwner(actor)) return { error: 'Not authorised.' };
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
  return { actorId: actor!.id, actorEmail: actor!.email, ip };
}

function audit(g: { actorId: number; actorEmail: string; ip: string | null },
               action: string, entity: string, detail: unknown) {
  queries.insertAudit({ user_id: g.actorId, email: g.actorEmail, action, entity, detail, ip: g.ip });
}

/** Tier change straight from the list row. Setting a paid tier by hand is a
 *  COMP — it creates no Stripe subscription and bills nobody. */
export async function quickSetTier(_prev: RowActionState, form: FormData): Promise<RowActionState> {
  const g = await guard(); if ('error' in g) return g;
  const userId = Number(form.get('userId'));
  const tier = String(form.get('tier') ?? '').trim();
  if (!Number.isFinite(userId)) return { error: 'Bad account id.' };
  if (!Object.keys(TIER_LIMITS).includes(tier)) return { error: `Unknown tier "${tier}".` };

  const before = queries.getUserById(userId);
  if (!before) return { error: 'Account not found.' };
  if (before.tier === tier) return { ok: `Already on ${tier}.` };

  queries.setUserTier(userId, tier, before.subscription_status ?? undefined, before.subscription_renews_at ?? null);
  audit(g, 'user.tier', `users/${userId}`, { email: before.email, from: before.tier, to: tier, comp: true });
  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);
  return { ok: `${before.email}: ${before.tier} → ${tier} (comp — nobody was billed).` };
}

const ALLOWED_STATUS = ['', 'founding_free', 'trialing', 'active', 'past_due', 'upgrade_due', 'canceled'];

/** Subscription status straight from the list row. Does NOT touch Stripe or PayPal. */
export async function quickSetStatus(_prev: RowActionState, form: FormData): Promise<RowActionState> {
  const g = await guard(); if ('error' in g) return g;
  const userId = Number(form.get('userId'));
  const status = String(form.get('status') ?? '').trim();
  if (!Number.isFinite(userId)) return { error: 'Bad account id.' };
  if (!ALLOWED_STATUS.includes(status)) return { error: `Unknown status "${status}".` };

  const before = queries.getUserById(userId);
  if (!before) return { error: 'Account not found.' };
  if ((before.subscription_status ?? '') === status) return { ok: 'No change.' };

  queries.setUserTier(userId, before.tier, status || undefined, before.subscription_renews_at ?? null);
  audit(g, 'user.subscription', `users/${userId}`, {
    email: before.email, from: before.subscription_status ?? null, to: status || null,
  });
  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);
  return { ok: `${before.email}: status → ${status || '(cleared)'}. Stripe and PayPal were not touched.` };
}

/** Permanently delete an account and everything cascading off it.
 *
 *  Mirrors DELETE /api/admin/users/[id]: owner-gated, refuses self-deletion,
 *  audited (the audit row survives with user_id nulled), and announced to
 *  Slack. The typed-email confirmation is enforced here as well as in the UI,
 *  so a stray POST can't drop an account. */
export async function deleteUserAction(_prev: RowActionState, form: FormData): Promise<RowActionState> {
  const g = await guard(); if ('error' in g) return g;
  const userId = Number(form.get('userId'));
  const typed = String(form.get('confirmEmail') ?? '').trim().toLowerCase();
  if (!Number.isFinite(userId)) return { error: 'Bad account id.' };

  if (userId === g.actorId) return { error: 'You cannot delete your own account.' };

  const target = queries.getUserById(userId);
  if (!target) return { error: 'Account not found.' };
  if (typed !== target.email.toLowerCase()) {
    return { error: 'Typed email does not match this account — nothing was deleted.' };
  }

  const routes = (getDb().prepare(`SELECT COUNT(*) AS n FROM searches WHERE user_id = ?`)
    .get(userId) as { n: number }).n;

  queries.deleteUserCascade(userId);
  audit(g, 'admin.user.delete', `user:${userId}`, {
    deleted_email: target.email, deleted_tier: target.tier, routes,
  });

  import('@/lib/notifier')
    .then(m => m.notifyAccountDeletedToSlack(target, {
      by: 'admin', byEmail: g.actorEmail, routes, ip: g.ip,
    }))
    .catch(() => { /* non-critical */ });

  revalidatePath('/admin/users');
  return { ok: `Deleted ${target.email} and ${routes} route${routes === 1 ? '' : 's'}.` };
}

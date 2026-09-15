'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { queries, TIER_LIMITS } from '@/lib/db';

export type ActionState = { ok?: string; error?: string } | null;

/** Every mutation here changes what a real customer receives, so each one is
 *  owner-gated, validated, and written to the audit log with from → to. */
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

/** Change a customer's tier. Setting a paid tier by hand grants a COMP —
 *  it creates no Stripe subscription and bills nobody. */
export async function setTier(_prev: ActionState, form: FormData): Promise<ActionState> {
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
  revalidatePath(`/admin/users/${userId}`);
  return { ok: `Tier changed ${before.tier} → ${tier} (comp — nobody was billed).` };
}

const ALLOWED_STATUS = ['', 'founding_free', 'trialing', 'active', 'past_due', 'upgrade_due', 'canceled'];

/** Adjust subscription status / trial end. Does NOT touch Stripe or PayPal. */
export async function setSubscription(_prev: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(); if ('error' in g) return g;
  const userId = Number(form.get('userId'));
  const status = String(form.get('status') ?? '').trim();
  const trial = String(form.get('trial_ends_at') ?? '').trim();
  if (!Number.isFinite(userId)) return { error: 'Bad account id.' };
  if (!ALLOWED_STATUS.includes(status)) return { error: `Unknown status "${status}".` };
  if (trial && !/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(trial)) {
    return { error: 'Trial end must be YYYY-MM-DD (optionally with HH:MM).' };
  }

  const before = queries.getUserById(userId);
  if (!before) return { error: 'Account not found.' };

  queries.setUserTier(userId, before.tier, status || undefined, before.subscription_renews_at ?? null);
  queries.setTrialEndsAt(userId, trial || null);
  audit(g, 'user.subscription', `users/${userId}`, {
    email: before.email,
    from: { status: before.subscription_status, trial_ends_at: before.trial_ends_at ?? null },
    to: { status: status || null, trial_ends_at: trial || null },
  });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: 'Subscription updated. Stripe and PayPal were not touched.' };
}

/** Per-user fare setting overrides. Same validation as the platform page. */
const USER_EDITABLE: Record<string, (v: string) => string | null> = {
  alert_threshold_per_adult_usd: v => /^\d+(\.\d+)?$/.test(v) && +v > 0 && +v <= 100000 ? null : 'Positive number up to 100000.',
  max_display_per_adult_usd:     v => /^\d+(\.\d+)?$/.test(v) && +v > 0 && +v <= 100000 ? null : 'Positive number up to 100000.',
  price_drop_pct:                v => /^\d+(\.\d+)?$/.test(v) && +v > 0 && +v <= 100 ? null : 'Percentage between 1 and 100.',
  alert_channels: v => {
    const allowed = ['email', 'sms', 'whatsapp', 'telegram', 'slack', 'push'];
    const parts = v.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return 'Pick at least one channel.';
    const bad = parts.filter(x => !allowed.includes(x));
    return bad.length ? `Unknown channel: ${bad.join(', ')}.` : null;
  },
};

export async function setFareSetting(_prev: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(); if ('error' in g) return g;
  const userId = Number(form.get('userId'));
  const key = String(form.get('key') ?? '');
  const raw = String(form.get('value') ?? '').trim();
  if (!Number.isFinite(userId)) return { error: 'Bad account id.' };
  const validate = USER_EDITABLE[key];
  if (!validate) return { error: `"${key}" is not editable.` };

  const before = queries.getUserById(userId);
  if (!before) return { error: 'Account not found.' };
  const prev = queries.getUserSetting(userId, key) ?? '';

  // Empty clears the override so they fall back to the platform default.
  if (raw === '') {
    queries.deleteUserSetting(userId, key);
    audit(g, 'user.setting', `users/${userId}/${key}`, { email: before.email, from: prev || null, to: null });
    revalidatePath(`/admin/users/${userId}`);
    return { ok: 'Override cleared — back to the platform default.' };
  }
  const err = validate(raw);
  if (err) return { error: err };
  if (raw === prev) return { ok: 'No change.' };

  queries.setUserSetting(userId, key, raw);
  audit(g, 'user.setting', `users/${userId}/${key}`, { email: before.email, from: prev || null, to: raw });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: `Saved — ${prev || '(unset)'} → ${raw}.` };
}

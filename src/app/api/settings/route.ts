import { NextResponse } from 'next/server';
import { z } from 'zod';
import { queries } from '@/lib/db';
import { restartCron } from '@/lib/cron';
import { requireUser } from '@/lib/apiGuard';
import { isOwner } from '@/lib/auth';

/**
 * Account settings.
 *
 * THREE THINGS WERE WRONG HERE, ALL REACHABLE FROM THE OPEN INTERNET.
 *
 * 1. No authentication, on either verb. middleware.ts excludes `api/` from its
 *    matcher, so nothing else was guarding it either. An anonymous GET returned
 *    the owner's alert email, a Slack target and a Telegram chat id; an
 *    anonymous PUT could repoint alert_email at an attacker's inbox, move the
 *    global alert threshold, or change poll_interval_minutes and restart cron.
 *
 * 2. Everything was GLOBAL. Each account's settings page read and wrote the
 *    same shared rows, so one user changing their alert threshold changed it
 *    for everyone — while the poller reads the PER-USER value first, meaning
 *    the page never actually edited the setting it was displaying.
 *
 * 3. It returned secrets. A webhook URL is a credential; whether one is set is
 *    all a settings page needs, so that is all this returns now.
 */

/** Settings that belong to ONE account. Stored per user. */
const USER_KEYS = [
  'alert_threshold_per_adult_usd',
  'alert_email',
  'max_display_per_adult_usd',
  'price_drop_pct',
  'alert_channels',
  'alert_telegram_chat_id',
  'alert_phone',
  'alert_phone_whatsapp',
] as const;

/**
 * Settings that change how the SERVICE runs, for everybody. Owner only.
 *
 * poll_interval_minutes is here rather than on the settings form because it is
 * the scheduler tick, not a per-account promise — the poll allocator decides
 * how often any given route is actually checked. See lib/pollBudget.ts.
 */
const GLOBAL_KEYS = [
  'poll_interval_minutes',
  'enabled_providers',
  'usd_to_egp',
] as const;

/** Credentials. Never returned; only whether they are set. */
const SECRET_KEYS = ['alert_slack_webhook', 'alert_slack_target', 'alert_ig_user_id'] as const;

type UserKey = (typeof USER_KEYS)[number];

/** Per-user value, falling back to the global default the account inherits. */
function effective(userId: number, key: string, fallback: string): string {
  return queries.getUserSetting(userId, key) ?? queries.getSetting(key) ?? fallback;
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const uid = auth.user.id;

  const body: Record<string, unknown> = {
    alert_threshold_per_adult_usd: parseFloat(effective(uid, 'alert_threshold_per_adult_usd', '900')),
    alert_email: effective(uid, 'alert_email', auth.user.email),
    max_display_per_adult_usd: parseFloat(effective(uid, 'max_display_per_adult_usd', '1200')),
    price_drop_pct: parseFloat(effective(uid, 'price_drop_pct', '10')),
    alert_channels: effective(uid, 'alert_channels', 'email'),
    alert_telegram_chat_id: effective(uid, 'alert_telegram_chat_id', ''),
  };

  // Presence, never the value.
  for (const k of SECRET_KEYS) {
    body[`${k}_configured`] = Boolean(queries.getUserSetting(uid, k) || queries.getSetting(k));
  }

  if (isOwner(auth.user)) {
    for (const k of GLOBAL_KEYS) body[k] = queries.getSetting(k) ?? null;
  }

  return NextResponse.json(body);
}

const PutSchema = z.object({
  alert_threshold_per_adult_usd: z.number().positive().optional(),
  alert_email: z.string().email().optional(),
  max_display_per_adult_usd: z.number().positive().optional(),
  price_drop_pct: z.number().min(1).max(80).optional(),
  alert_channels: z.string().regex(/^[a-z,]*$/).optional(),
  alert_telegram_chat_id: z.string().max(100).optional(),
  alert_phone: z.string().max(40).optional(),
  alert_phone_whatsapp: z.string().max(40).optional(),
  // Owner-only. Silently ignored for everyone else rather than rejected, so a
  // stale client cannot be told which keys are privileged.
  poll_interval_minutes: z.number().int().min(5).max(1440).optional(),
  enabled_providers: z.string().regex(/^[a-z,]+$/).optional(),
  usd_to_egp: z.number().positive().optional(),
});

export async function PUT(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const owner = isOwner(auth.user);
  let cadenceChanged = false;
  const ignored: string[] = [];

  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;

    if ((GLOBAL_KEYS as readonly string[]).includes(k)) {
      if (!owner) { ignored.push(k); continue; }
      queries.setSetting(k, String(v));
      if (k === 'poll_interval_minutes') cadenceChanged = true;
      continue;
    }

    if ((USER_KEYS as readonly string[]).includes(k as UserKey)) {
      queries.setUserSetting(auth.user.id, k, String(v));
      continue;
    }

    ignored.push(k);
  }

  if (cadenceChanged) restartCron();
  // Saying what was ignored keeps a silent no-op from looking like a save.
  return NextResponse.json(ignored.length ? { ok: true, ignored } : { ok: true });
}

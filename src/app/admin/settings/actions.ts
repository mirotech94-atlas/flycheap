'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { queries } from '@/lib/db';

/** Validation for every editable platform setting. Anything not listed is rejected. */
const EDITABLE: Record<string, { label: string; validate: (v: string) => string | null }> = {
  alert_threshold_per_adult_usd: {
    label: 'Alert threshold (per adult USD)',
    validate: v => /^\d+(\.\d+)?$/.test(v) && +v > 0 && +v <= 100000 ? null : 'Enter a positive number up to 100000.',
  },
  max_display_per_adult_usd: {
    label: 'Dashboard cap (per adult USD)',
    validate: v => /^\d+(\.\d+)?$/.test(v) && +v > 0 && +v <= 100000 ? null : 'Enter a positive number up to 100000.',
  },
  poll_interval_minutes: {
    label: 'Poll interval (minutes)',
    validate: v => /^\d+$/.test(v) && +v >= 1 && +v <= 1440 ? null : 'Enter a whole number of minutes between 1 and 1440.',
  },
  price_drop_pct: {
    label: 'Price-drop alert threshold (%)',
    validate: v => /^\d+(\.\d+)?$/.test(v) && +v > 0 && +v <= 100 ? null : 'Enter a percentage between 1 and 100.',
  },
  alert_channels: {
    label: 'Active alert channels',
    validate: v => {
      const allowed = ['email', 'sms', 'whatsapp', 'telegram', 'slack', 'push'];
      const parts = v.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      if (parts.length === 0) return 'Pick at least one channel.';
      const bad = parts.filter(x => !allowed.includes(x));
      return bad.length ? `Unknown channel: ${bad.join(', ')}. Allowed: ${allowed.join(', ')}.` : null;
    },
  },
  enabled_providers: {
    label: 'Enabled fare providers',
    validate: v => {
      const allowed = ['travelpayouts', 'amadeus', 'serpapi', 'duffel', 'kiwi', 'searchapi'];
      const parts = v.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      if (parts.length === 0) return 'Enable at least one provider or polling stops.';
      const bad = parts.filter(x => !allowed.includes(x));
      return bad.length ? `Unknown provider: ${bad.join(', ')}. Allowed: ${allowed.join(', ')}.` : null;
    },
  },
  usd_to_egp: {
    label: 'USD → EGP conversion rate',
    validate: v => /^\d+(\.\d+)?$/.test(v) && +v > 0 ? null : 'Enter a positive conversion rate.',
  },
  alert_email: {
    label: 'Operator alert email',
    validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'Enter a valid email address.',
  },
  alert_slack_admin_target: {
    label: 'Slack · #admin_alerts channel ID',
    validate: v => v === '' || /^[CG][A-Z0-9]{8,}$/.test(v) ? null : 'Enter a Slack channel ID (starts with C, e.g. C0B4233G9PE) or leave blank.',
  },
  alert_slack_support_target: {
    label: 'Slack · #support channel ID (concierge)',
    validate: v => v === '' || /^[CG][A-Z0-9]{8,}$/.test(v) ? null : 'Enter a Slack channel ID (starts with C, e.g. C0B3H0YJUHM) or leave blank.',
  },
  alert_slack_target: {
    label: 'Slack · #client_alerts channel ID',
    validate: v => v === '' || /^[CG][A-Z0-9]{8,}$/.test(v) ? null : 'Enter a Slack channel ID (starts with C, e.g. C0B3YEK82BC) or leave blank.',
  },
  ops_agent_enabled: {
    label: 'Slack ops agent',
    validate: v => v === 'true' || v === 'false' ? null : 'Enter true or false.',
  },
};

export type SettingResult = { ok: boolean; key?: string; message: string };

/**
 * Write one platform setting. Founder-only, validated, and written to the audit
 * log with the before/after value so every change is traceable.
 */
export async function updateSetting(_prev: SettingResult | null, formData: FormData): Promise<SettingResult> {
  const user = await getCurrentUser();
  if (!isOwner(user)) return { ok: false, message: 'Not authorised.' };

  const key = String(formData.get('key') ?? '');
  const raw = String(formData.get('value') ?? '').trim();
  const spec = EDITABLE[key];
  if (!spec) return { ok: false, key, message: 'That setting is not editable here.' };

  const invalid = spec.validate(raw);
  if (invalid) return { ok: false, key, message: invalid };

  // Normalise comma lists so the poller reads a predictable shape.
  const value = (key === 'alert_channels' || key === 'enabled_providers')
    ? raw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).join(',')
    : raw;

  const before = queries.getSetting(key) ?? '(unset)';
  if (before === value) return { ok: true, key, message: 'No change — value is already set.' };

  queries.setSetting(key, value);
  try {
    const h = await headers();
    queries.insertAudit({
      user_id: user!.id, email: user!.email,
      action: 'settings.update', entity: `settings/${key}`,
      detail: { from: before, to: value },
      ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
    });
  } catch { /* audit is best-effort — never block the write */ }

  revalidatePath('/admin/settings');
  revalidatePath('/admin');
  return { ok: true, key, message: `Saved — ${spec.label} is now ${value}.` };
}

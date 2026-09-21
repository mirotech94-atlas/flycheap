import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, queries, limitsForUser, TIER_LIMITS } from '@/lib/db';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { PageHead, Panel, Kpi, Table, Status, fmtInt, ago, type Tone } from '../../_components/ui';
import { TierForm, FareSettingForm, SubscriptionForm } from './forms';

export const dynamic = 'force-dynamic';

/** Per-user fare settings an admin can adjust on the customer's behalf. */
export const USER_SETTING_ROWS = [
  { key: 'alert_threshold_per_adult_usd', label: 'Alert threshold ($/adult)',
    hint: 'Their default target. Routes without their own target alert below this.' },
  { key: 'price_drop_pct', label: 'Price-drop threshold (%)',
    hint: 'How far under the 7-day median counts as an anomaly. Pro capability.' },
  { key: 'alert_channels', label: 'Alert channels',
    hint: 'Comma-separated. Only channels their tier allows will actually fire.' },
  { key: 'max_display_per_adult_usd', label: 'Dashboard cap ($/adult)',
    hint: 'Fares above this are hidden from their deals table.' },
] as const;

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // The /admin layout gates this too, but a detail route holding PII should
  // never depend on a parent layout alone.
  if (!isOwner(await getCurrentUser())) notFound();

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (!Number.isFinite(userId)) notFound();

  const u = queries.getUserById(userId);
  if (!u) notFound();

  const limits = limitsForUser(u);
  const routes = queries.listSearchesForUser(userId);
  const db = getDb();

  const settings = Object.fromEntries(
    USER_SETTING_ROWS.map(r => [r.key, queries.getUserSetting(userId, r.key) ?? '']),
  ) as Record<string, string>;

  const clicks = (db.prepare(
    `SELECT COUNT(*) AS n FROM affiliate_clicks WHERE user_id = ?`).get(userId) as { n: number }).n;
  const lastSeen = (db.prepare(
    `SELECT MAX(occurred_at) AS t FROM audit_log
      WHERE user_id = ? AND coalesce(detail, '') NOT LIKE '%"internal":true%'`).get(userId) as { t: string | null } | undefined)?.t ?? null;
  const recent = db.prepare(
    `SELECT occurred_at, action, entity, detail FROM audit_log WHERE user_id = ?
      ORDER BY occurred_at DESC LIMIT 12`).all(userId) as Array<{
        occurred_at: string; action: string; entity: string | null; detail: string | null }>;

  const status = (u.subscription_status ?? '').toLowerCase();
  const statusTone: Tone =
    status === 'active' ? 'good'
    : status === 'founding_free' || status === 'trialing' ? 'gold'
    : status === 'past_due' || status === 'upgrade_due' ? 'warn'
    : 'neutral';
  const billed = ['active', 'trialing', 'past_due'].includes(status);

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Customers · account"
        title={u.name?.trim() || u.email}
        sub={`Account #${u.id} · joined ${ago(u.created_at)}. Changes here alter what this customer receives and are written to the audit log.`}
        right={<Link href="/admin/users" className="ad-btn">← All accounts</Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Tier" value={u.tier} tone={u.tier === 'free' ? 'neutral' : 'gold'}
          foot={`${limits.maxRoutes} routes · polls every ${limits.pollIntervalMin} min`} />
        <Kpi label="Subscription" value={u.subscription_status || 'none'} tone={statusTone}
          foot={billed ? 'Counts toward MRR' : 'Not billed — comp or free'} />
        <Kpi label="Tracked routes" value={fmtInt(routes.length)}
          foot={routes.length === 0 ? 'No routes — cannot receive an alert' : `of ${limits.maxRoutes} allowed`} />
        <Kpi label="Outbound clicks" value={fmtInt(clicks)}
          foot={lastSeen ? `Last seen ${ago(lastSeen)}` : 'Never active'} />
      </div>

      {/* ── Identity ── */}
      <Panel title="Contact details" sub="Collected at sign-up. Phone is optional.">
        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
          <Field label="Name" value={u.name} missing="Not provided" />
          <Field label="Email" value={u.email} mono />
          <Field label="Phone" value={u.phone} missing="Not provided" mono />
          <Field label="Username" value={u.username} missing="—" mono />
          <Field label="Joined" value={new Date(u.created_at.replace(' ', 'T') + 'Z').toLocaleString()} />
          <Field label="Trial ends" value={u.trial_ends_at ?? null} missing="No trial" />
        </dl>
      </Panel>

      {/* ── Plan ── */}
      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <Panel title="Plan" sub="Setting a paid tier by hand grants a COMP — it does not create a Stripe subscription or bill anyone.">
          <TierForm userId={u.id} tier={u.tier} tiers={Object.keys(TIER_LIMITS)} />
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--rule-soft)' }}>
            <SubscriptionForm userId={u.id} status={u.subscription_status ?? ''} trialEndsAt={u.trial_ends_at ?? ''} />
          </div>
        </Panel>

        <Panel title="Fare settings" sub="Per-account overrides. Blank means they inherit the platform default.">
          {USER_SETTING_ROWS.map(r => (
            <FareSettingForm key={r.key} userId={u.id} settingKey={r.key}
              label={r.label} hint={r.hint} value={settings[r.key]} />
          ))}
        </Panel>
      </div>

      {/* ── Routes ── */}
      <Panel title="Tracked routes" sub="What this account is actually watching"
        right={<span className="text-[11px] font-mono" style={{ color: 'var(--muted-2)' }}>{routes.length} route{routes.length === 1 ? '' : 's'}</span>}>
        {routes.length === 0 ? (
          <div className="py-8 text-center text-[12.5px]" style={{ color: 'var(--muted-2)' }}>
            No routes. This account cannot receive an alert until it adds one — activation, not acquisition, is the gap.
          </div>
        ) : (
          <Table head={['Route', 'Dates', 'Target', 'Mode', 'State']}>
            {routes.map(r => (
              <tr key={r.id}>
                <td className="font-mono font-medium" style={{ color: 'var(--ink)' }}>{r.origin} → {r.destination}</td>
                <td className="whitespace-nowrap" style={{ color: 'var(--muted)' }}>{r.depart_date} → {r.return_date}</td>
                <td className="font-mono tabular-nums">
                  {r.target_per_adult_usd != null ? `$${Math.round(r.target_per_adult_usd)}` : <span style={{ color: 'var(--muted-2)' }}>default</span>}
                </td>
                <td style={{ color: 'var(--muted)' }}>{(r as { date_mode?: string }).date_mode === 'any' ? 'Any dates' : 'Exact'}</td>
                <td>{r.active ? <Status tone="good">Active</Status> : <Status tone="neutral">Paused</Status>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      {/* ── Activity ── */}
      <Panel title="Recent activity" sub="From the audit log">
        {recent.length === 0 ? (
          <div className="py-6 text-center text-[12.5px]" style={{ color: 'var(--muted-2)' }}>No recorded activity.</div>
        ) : (
          <Table head={['When', 'Action', 'Entity']}>
            {recent.map((a, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap" style={{ color: 'var(--muted)' }}>{ago(a.occurred_at)}</td>
                <td className="font-mono text-[11.5px]">{a.action}</td>
                <td style={{ color: 'var(--muted)' }}>{a.entity ?? '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

function Field({ label, value, missing, mono }: {
  label: string; value: string | null | undefined; missing?: string; mono?: boolean;
}) {
  return (
    <div>
      <dt className="ad-eyebrow">{label}</dt>
      <dd className={`mt-1 ${mono ? 'font-mono text-[12.5px]' : ''}`} style={{ color: value ? 'var(--ink)' : 'var(--muted-2)' }}>
        {value || missing || '—'}
      </dd>
    </div>
  );
}

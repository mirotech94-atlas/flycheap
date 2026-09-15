import Link from 'next/link';
import { queries } from '@/lib/db';
import { PageHead, Panel, Kpi, Table, fmtInt, ago } from '../_components/ui';
import { SettingForm } from './SettingForm';

export const dynamic = 'force-dynamic';

type Row = { key: string; label: string; fallback: string; hint: string; options?: string[] };

/** The platform-level values that drive polling, alerting and display. */
const ROWS: Row[] = [
  { key: 'alert_threshold_per_adult_usd', label: 'Alert threshold (per adult USD)', fallback: '900',
    hint: 'Default target price. A route without its own target alerts below this figure.' },
  { key: 'price_drop_pct', label: 'Price-drop alert threshold (%)', fallback: '10',
    hint: 'How far under the 7-day median a fare must fall to count as an anomaly.' },
  { key: 'poll_interval_minutes', label: 'Poll interval (minutes)', fallback: '30',
    hint: 'Base cadence for the fare engine. Pro accounts poll faster via tier limits.' },
  { key: 'max_display_per_adult_usd', label: 'Dashboard cap (per adult USD)', fallback: '1200',
    hint: 'Fares above this are hidden from the deals table by default.' },
  { key: 'enabled_providers', label: 'Enabled fare providers', fallback: 'travelpayouts',
    hint: 'Comma-separated. Every enabled provider is polled in parallel; the cheapest valid offer wins.',
    options: ['travelpayouts', 'travelpayouts,duffel', 'travelpayouts,duffel,serpapi', 'travelpayouts,duffel,serpapi,searchapi'] },
  { key: 'alert_channels', label: 'Active alert channels', fallback: 'email',
    hint: 'Comma-separated. Allowed: email, sms, whatsapp, telegram, slack, push.',
    options: ['email', 'email,telegram', 'email,slack,telegram', 'email,sms,whatsapp,telegram'] },
  { key: 'alert_email', label: 'Operator alert email', fallback: '',
    hint: 'Where operational notices are sent.' },
  { key: 'alert_slack_admin_target', label: 'Slack · #admin_alerts channel ID', fallback: '',
    hint: 'Founder-only. New signups, billing events (started / trial ending / payment failed / paid / cancelled) and contact-form messages post here. Clear to disable.' },
  { key: 'alert_slack_support_target', label: 'Slack · #support channel ID (concierge)', fallback: '',
    hint: 'Client-facing room. The concierge answers human messages posted here. Not for founder notifications.' },
  { key: 'alert_slack_target', label: 'Slack · #client_alerts channel ID', fallback: '',
    hint: 'Founder-only mirror: one line per fare alert sent to any client (who, route, price, which channels delivered). Clients never see this channel. Clear to disable.' },
  { key: 'usd_to_egp', label: 'USD → EGP conversion rate', fallback: '49.5',
    hint: 'Display-only rate for the EGP price labels.' },
];

export default async function AdminSettingsPage() {
  const values = Object.fromEntries(
    ROWS.map(r => [r.key, queries.getSetting(r.key) ?? r.fallback]),
  ) as Record<string, string>;

  const callsThisMonth = queries.apiCallsThisMonth?.()?.count ?? 0;
  const lastAlert = queries.recentAlerts?.(1)?.[0]?.sent_at ?? null;
  const audit = (() => {
    try {
      return queries.recentAudit?.(12) ?? [];
    } catch { return []; }
  })() as Array<{ occurred_at?: string; created_at?: string; action: string; entity: string | null; detail: string | null; email: string | null }>;
  const settingAudit = audit.filter(a => a.action === 'settings.update').slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Platform · live configuration"
        title="Platform settings"
        sub="These values drive the fare engine in production. A change saves immediately, applies on the next polling cycle, and is written to the audit log."
        right={<Link href="/admin/health" className="ad-btn">Fare engine →</Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Providers enabled" value={String(values.enabled_providers.split(',').filter(Boolean).length)}
          foot={values.enabled_providers} />
        <Kpi label="Poll cadence" value={values.poll_interval_minutes} unit="min" tone="gold"
          foot="Base interval; Pro tiers poll faster" />
        <Kpi label="Provider calls · month" value={fmtInt(callsThisMonth)} foot="Counted against provider quotas" />
        <Kpi label="Last alert sent" value={lastAlert ? ago(lastAlert) : '—'} foot="Across every tracked route" />
      </div>

      <Panel
        title="Live values"
        sub="Edit here — no need to switch to the client app. Each field is validated before it is written."
      >
        {ROWS.map(r => (
          <SettingForm
            key={r.key}
            settingKey={r.key}
            label={r.label}
            value={values[r.key]}
            hint={r.hint}
            options={r.options}
          />
        ))}
      </Panel>

      <Panel title="Recent configuration changes" sub="Every save is recorded with the before and after value">
        {settingAudit.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-white/35">
            No configuration changes recorded yet.
          </div>
        ) : (
          <Table head={['When', 'Setting', 'Change', 'By']}>
            {settingAudit.map((a, i) => {
              let change = a.detail ?? '';
              try {
                const d = JSON.parse(a.detail ?? '{}') as { from?: string; to?: string };
                if (d.to !== undefined) change = `${d.from ?? '(unset)'} → ${d.to}`;
              } catch { /* keep raw */ }
              return (
                <tr key={i}>
                  <td className="text-white/50 whitespace-nowrap">{ago(a.occurred_at ?? a.created_at)}</td>
                  <td className="font-mono text-[11.5px]">{(a.entity ?? '').replace('settings/', '')}</td>
                  <td className="font-mono text-[11.5px] text-white/70">{change}</td>
                  <td className="text-white/45">{a.email ?? '—'}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      <p className="text-[11.5px] text-white/35 leading-relaxed">
        Secrets (API keys, tokens, billing credentials) are deliberately not editable here — they live in the
        server environment file and are never rendered to a browser. Manage provider keys on the{' '}
        <Link href="/admin/integrations" className="text-white/60 underline">Integrations</Link> page.
      </p>
    </div>
  );
}

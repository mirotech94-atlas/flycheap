import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  // Read the current platform-level settings so the admin can see (and the
  // user can later edit) the values that drive cron cadence, threshold caps,
  // and alert defaults. For now this is read-only; mutations stay on the
  // client-facing /settings page so we don't duplicate write paths.
  const platform = {
    alert_threshold_per_adult_usd: queries.getSetting('alert_threshold_per_adult_usd') ?? '900',
    max_display_per_adult_usd:     queries.getSetting('max_display_per_adult_usd')     ?? '1200',
    poll_interval_minutes:         queries.getSetting('poll_interval_minutes')         ?? '30',
    price_drop_pct:                queries.getSetting('price_drop_pct')                ?? '10',
    alert_channels:                queries.getSetting('alert_channels')                ?? 'email',
    usd_to_egp:                    queries.getSetting('usd_to_egp')                    ?? '—',
    enabled_providers:             queries.getSetting('enabled_providers')             ?? '—',
  };

  const rows: Array<{ key: string; label: string; value: string; hint: string }> = [
    { key: 'alert_threshold_per_adult_usd', label: 'Alert threshold (per adult USD)',  value: platform.alert_threshold_per_adult_usd, hint: 'Send a price-drop alert when per-adult fare falls below this value.' },
    { key: 'max_display_per_adult_usd',     label: 'Dashboard cap (per adult USD)',    value: platform.max_display_per_adult_usd,     hint: 'Hide deals above this cap from the dashboard table by default.' },
    { key: 'poll_interval_minutes',         label: 'Poll interval (minutes)',          value: platform.poll_interval_minutes,         hint: 'How often the background cron pulls fresh fares.' },
    { key: 'price_drop_pct',                label: 'Price-drop alert threshold (%)',   value: platform.price_drop_pct,                hint: 'Minimum percent drop vs. last cached fare to trigger an alert.' },
    { key: 'alert_channels',                label: 'Active alert channels',            value: platform.alert_channels,                hint: 'Comma-separated list. e.g. email,slack,sms.' },
    { key: 'usd_to_egp',                    label: 'USD → EGP conversion rate',        value: platform.usd_to_egp,                    hint: 'Display-only conversion used in the EGP price labels.' },
    { key: 'enabled_providers',             label: 'Enabled fare providers',           value: platform.enabled_providers,             hint: 'Comma-separated provider IDs that the poll cron will hit.' },
  ];

  // Quick stats so the admin can sanity-check that polling is alive even
  // without leaving this page.
  const callsThisMonth = queries.apiCallsThisMonth?.()?.count ?? 0;
  const activeSearches = queries.countActiveSearches?.() ?? 0;
  const recentAlerts   = queries.recentAlerts?.(1)?.[0]?.sent_at ?? null;

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow mb-1">Admin · Settings</div>
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-display">
          Platform settings
        </h1>
        <p className="text-sm text-white/55 mt-1">
          Global platform-level defaults read from the <code>settings</code> table. Mutations stay on the
          client-facing <a href="/settings" className="text-amber-300 underline">Settings page</a> for
          now to keep a single write path.
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="kpi">
          <div className="kpi-label">API calls this month</div>
          <div className="kpi-value">{callsThisMonth.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Active tracked routes</div>
          <div className="kpi-value">{activeSearches.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Last alert sent</div>
          <div className="kpi-value text-base">{recentAlerts ?? '—'}</div>
        </div>
        <div className="kpi kpi-brand">
          <div className="kpi-label">Cron cadence</div>
          <div className="kpi-value">{platform.poll_interval_minutes}m</div>
          <div className="kpi-sub">poll interval</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="!mb-0">Live values</h2>
          <a href="/settings" className="text-xs px-3 py-1.5 rounded-md border border-amber-300/40 bg-amber-300/10 text-amber-200 hover:bg-amber-300/20 transition">
            Edit in client app ↗
          </a>
        </div>
        <table className="w-full mt-2 text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-white/45 border-b border-white/8">
              <th className="py-2">Setting</th>
              <th className="py-2">Current value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-b border-white/5 last:border-0 align-top">
                <td className="py-3 pr-4">
                  <div className="font-semibold">{r.label}</div>
                  <div className="text-[11px] text-white/45 mt-0.5"><code>{r.key}</code></div>
                  <div className="text-xs text-white/55 mt-1">{r.hint}</div>
                </td>
                <td className="py-3 font-mono text-amber-200">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

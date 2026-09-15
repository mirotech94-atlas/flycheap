import { queries, TIER_LIMITS } from '@/lib/db';
import { fmtUSD, fmtDateTime } from '@/lib/utils';
import { PieCard } from '@/components/charts';
import { SettingsForm } from '@/components/SettingsForm';
import { SmsOptIn } from '@/components/SmsOptIn';
import { PollNowButton } from '@/components/PollNowButton';
import { ProviderSettings } from '@/components/ProviderSettings';
import { providerStatuses } from '@/lib/providers';
import { ShareLinkCard } from '@/components/ShareLinkCard';
import { DigestPreview } from '@/components/DigestPreview';
import { WhiteLabelSettings } from '@/components/WhiteLabelSettings';
import { DangerZone } from '@/components/DangerZone';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const QUOTA = 2000; // Amadeus self-service free tier

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/settings');

  const tierLimit = TIER_LIMITS[user.tier] ?? TIER_LIMITS.free;
  const activeRoutes = queries.countActiveSearchesForUser(user.id);
  const usagePct = Math.min(100, Math.round((activeRoutes / tierLimit.maxRoutes) * 100));
  const tierColor = { free: 'badge-muted', pro: 'badge-info', enterprise: 'badge-gold' }[user.tier] || 'badge-muted';

  const initial = {
    alert_threshold_per_adult_usd: parseFloat(queries.getSetting('alert_threshold_per_adult_usd') ?? '900'),
    alert_email: queries.getSetting('alert_email') ?? '',
    poll_interval_minutes: parseInt(queries.getSetting('poll_interval_minutes') ?? '30', 10),
    max_display_per_adult_usd: parseFloat(queries.getSetting('max_display_per_adult_usd') ?? '1200'),
    price_drop_pct: parseFloat(queries.getSetting('price_drop_pct') ?? '10'),
  };
  const used = queries.apiCallsThisMonth().count;
  const remaining = Math.max(0, QUOTA - used);

  const quotaPie = [
    { name: `Used (${used})`, value: used },
    { name: `Remaining (${remaining})`, value: remaining },
  ];

  const recent = queries.recentAlerts(20);

  return (
    <div className="space-y-6">
      <div className="motion-fade-in">
        <div className="eyebrow mb-1">Configuration</div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight font-display">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Thresholds, alerts, branding, providers, and digest preview.</p>
      </div>

      {/* Tier / usage card */}
      <div className="card card-feature motion-slide-up motion-delay-1">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="eyebrow">Account</div>
              <span className={`badge ${tierColor}`}>{user.tier}</span>
              {user.subscription_status && <span className="badge badge-muted">{user.subscription_status}</span>}
            </div>
            <h2 className="!mb-0 font-display font-bold text-lg mt-1">{user.email}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {user.tier === 'free'
                ? 'Free tier — limited to 5 active routes and email alerts only.'
                : user.tier === 'pro'
                  ? 'Pro — unlimited routes, multi-channel alerts, white-label branding.'
                  : 'Enterprise — everything plus API + SSO.'}
            </p>
          </div>
          <div className="md:w-72 w-full">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
              <span>Active routes</span>
              <span className="tabular text-slate-700 dark:text-slate-300">
                {activeRoutes} / {tierLimit.maxRoutes === 9999 ? '∞' : tierLimit.maxRoutes}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all ${usagePct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {user.tier === 'free' && (
              <a href="/api/billing/checkout" className="btn btn-primary btn-sm w-full justify-center mt-3">
                Upgrade to Pro · $9/mo →
              </a>
            )}
          </div>
        </div>
      </div>

      <SettingsForm initial={initial} />

      <SmsOptIn
        phone={queries.getUserSetting(user.id, 'sms_phone') ?? ''}
        optIn={queries.getUserSetting(user.id, 'sms_opt_in') === 'true'}
        verified={queries.getUserSetting(user.id, 'sms_verified') === 'true'}
      />

      <WhiteLabelSettings />

      <ProviderSettings initial={providerStatuses()} />

      <ShareLinkCard />

      <DigestPreview />

      <div className="card">
        <h2>Manual poll</h2>
        <p className="text-sm text-slate-500 mb-3">Force a poll of every active search right now.</p>
        <PollNowButton label="Poll all searches now" />
      </div>

      <PieCard
        title={`Amadeus API usage this month (cap ${QUOTA})`}
        data={quotaPie}
        valueLabel="Calls"
      />

      <div className="card overflow-x-auto">
        <div className="card-head">
          <h2 className="!mb-0">Recent alerts sent (last 20)</h2>
          <a href="/api/alerts/export" className="btn btn-sm" title="Download full alert history as CSV">
            ⬇ Export CSV
          </a>
        </div>
        {recent.length === 0 ? (
          <div className="text-sm text-slate-400 py-6 text-center">No alerts sent yet.</div>
        ) : (
          <table className="fmt">
            <thead>
              <tr>
                <th>Sent</th>
                <th>Search</th>
                <th>Depart</th>
                <th>Return</th>
                <th className="text-right">Per adult</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(a => (
                <tr key={a.id}>
                  <td className="text-slate-500">{fmtDateTime(a.sent_at)}</td>
                  <td className="font-semibold">{a.origin} → {a.destination}</td>
                  <td>{a.depart_date}</td>
                  <td>{a.return_date}</td>
                  <td className="text-right font-semibold">{fmtUSD(a.price_per_adult_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {user.id !== 1 && <DangerZone email={user.email} />}
    </div>
  );
}

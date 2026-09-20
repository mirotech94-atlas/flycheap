import { queries, limitsForUser } from '@/lib/db';
import { fmtUSD, fmtDateTime } from '@/lib/utils';
import { PieCard } from '@/components/charts';
import { SettingsForm } from '@/components/SettingsForm';
import { SmsOptIn } from '@/components/SmsOptIn';
import { AlertChannelsCard } from '@/components/AlertChannelsCard';
import { AlertPolicyCard } from '@/components/AlertPolicyCard';
import { PollNowButton } from '@/components/PollNowButton';
import { ProviderSettings } from '@/components/ProviderSettings';
import { providerStatuses } from '@/lib/providers';
import { ShareLinkCard } from '@/components/ShareLinkCard';
import { DigestPreview } from '@/components/DigestPreview';
import { WhiteLabelSettings } from '@/components/WhiteLabelSettings';
import { DangerZone } from '@/components/DangerZone';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getRequestLocale } from '@/lib/i18n/server';
import { getAppDict, fill } from '@/lib/i18n/app';

export const dynamic = 'force-dynamic';

const QUOTA = 2000; // Amadeus self-service free tier

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/settings');
  const t = getAppDict(await getRequestLocale()).settings;

  const tierLimit = limitsForUser(user);
  const activeRoutes = queries.countActiveSearchesForUser(user.id);
  const usagePct = Math.min(100, Math.round((activeRoutes / tierLimit.maxRoutes) * 100));
  const tierColor = { free: 'badge-muted', pro: 'badge-info', enterprise: 'badge-gold' }[user.tier] || 'badge-muted';

  // Per-account, falling back to the global default the account inherits.
  //
  // This page used to read the GLOBAL rows while the poller read the per-user
  // ones — so it displayed a number that was not the one in force, and saving
  // it changed that number for every other account instead of this one.
  const mine = (key: string, fallback: string) =>
    queries.getUserSetting(user.id, key) ?? queries.getSetting(key) ?? fallback;

  const initial = {
    alert_threshold_per_adult_usd: parseFloat(mine('alert_threshold_per_adult_usd', '900')),
    alert_email: mine('alert_email', user.email),
    max_display_per_adult_usd: parseFloat(mine('max_display_per_adult_usd', '1200')),
    price_drop_pct: parseFloat(mine('price_drop_pct', '10')),
  };
  const used = queries.apiCallsThisMonth().count;
  const remaining = Math.max(0, QUOTA - used);

  const quotaPie = [
    { name: fill(t.used, { n: used }), value: used },
    { name: fill(t.remaining, { n: remaining }), value: remaining },
  ];

  const recent = queries.recentAlerts(20);

  return (
    <div className="space-y-6">
      <div className="motion-fade-in">
        <div className="eyebrow mb-1">{t.eyebrow}</div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight font-display">{t.title}</h1>
        <p className="text-sm text-slate-500 mt-1">{t.sub}</p>
      </div>

      {/* Tier / usage card */}
      <div className="card card-feature motion-slide-up motion-delay-1">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="eyebrow">{t.account}</div>
              <span className={`badge ${tierColor}`}>{user.tier}</span>
              {user.subscription_status === 'founding_free' && <span className="badge badge-gold">Founding trial</span>}
              {user.subscription_status === 'upgrade_due' && <span className="badge badge-muted">Trial complete</span>}
              {user.subscription_status && !['founding_free', 'upgrade_due'].includes(user.subscription_status) && <span className="badge badge-muted">{user.subscription_status}</span>}
            </div>
            <h2 className="!mb-0 font-display font-bold text-lg mt-1">{user.email}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {user.tier === 'free'
                ? t.tierFree
                : user.tier === 'pro'
                  ? t.tierPro
                  : t.tierEnterprise}
            </p>
            {user.subscription_status === 'founding_free' && user.trial_ends_at && (
              <p className="text-xs text-emerald-600 mt-1">
                Founding trial — the basic capabilities are free for your first 3 months, until {new Date(user.trial_ends_at.replace(' ', 'T') + (user.trial_ends_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Upgrade to Pro or Enterprise whenever you want more.
              </p>
            )}
            {user.subscription_status === 'upgrade_due' && (
              <p className="text-xs text-amber-600 mt-1">
                Your 3-month founding trial is complete. You keep the Free plan — upgrade to Pro or Enterprise for more routes, flexible dates, full price history and more alert channels.
              </p>
            )}
          </div>
          <div className="md:w-72 w-full">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
              <span>{t.activeRoutes}</span>
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
                {t.upgrade}
              </a>
            )}
          </div>
        </div>
      </div>

      <SettingsForm initial={initial} />

      <AlertPolicyCard />

      <AlertChannelsCard />

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
        <h2>{t.manualPoll}</h2>
        <p className="text-sm text-slate-500 mb-3">{t.manualPollSub}</p>
        <PollNowButton label={t.pollAll} />
      </div>

      <PieCard
        title={fill(t.apiUsage, { n: QUOTA })}
        data={quotaPie}
        valueLabel={t.calls}
      />

      <div className="card overflow-x-auto">
        <div className="card-head">
          <h2 className="!mb-0">{t.recentAlerts}</h2>
          <a href="/api/alerts/export" className="btn btn-sm" title={t.exportTitle}>
            {t.exportCsv}
          </a>
        </div>
        {recent.length === 0 ? (
          <div className="text-sm text-slate-400 py-6 text-center">{t.noAlerts}</div>
        ) : (
          <table className="fmt">
            <thead>
              <tr>
                <th>{t.thSent}</th>
                <th>{t.thSearch}</th>
                <th>{t.thDepart}</th>
                <th>{t.thReturn}</th>
                <th className="text-right">{t.thPerAdult}</th>
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

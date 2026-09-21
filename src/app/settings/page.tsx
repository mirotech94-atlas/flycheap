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
import { FcPageHead } from '@/components/fc/PageKit';

export const dynamic = 'force-dynamic';

const QUOTA = 2000; // Amadeus self-service free tier

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/settings');
  const t = getAppDict(await getRequestLocale()).settings;

  const tierLimit = limitsForUser(user);
  const activeRoutes = queries.countActiveSearchesForUser(user.id);
  const usagePct = Math.min(100, Math.round((activeRoutes / tierLimit.maxRoutes) * 100));

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
      <div className="ed-eyebrow">{t.eyebrow}</div>
      <FcPageHead title={t.title} lede={t.sub} />

      {/* Tier / usage panel */}
      <section className="ed-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="ed-eyebrow">{t.account}</div>
              <span className="ed-chip">{user.tier}</span>
              {user.subscription_status === 'founding_free' && (
                <span className="ed-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className="ed-dot" aria-hidden />Founding trial
                </span>
              )}
              {user.subscription_status === 'upgrade_due' && (
                <span className="ed-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className="ed-dot muted" aria-hidden />Trial complete
                </span>
              )}
              {user.subscription_status && !['founding_free', 'upgrade_due'].includes(user.subscription_status) && <span className="ed-chip">{user.subscription_status}</span>}
            </div>
            <h2 className="ed-h2" style={{ fontSize: 19, marginTop: 6 }}>{user.email}</h2>
            <p className="ed-panel-note" style={{ marginTop: 4 }}>
              {user.tier === 'free'
                ? t.tierFree
                : user.tier === 'pro'
                  ? t.tierPro
                  : t.tierEnterprise}
            </p>
            {user.subscription_status === 'founding_free' && user.trial_ends_at && (
              <p className="text-xs mt-1" style={{ color: 'var(--green)' }}>
                Founding trial — the basic capabilities are free for your first 3 months, until {new Date(user.trial_ends_at.replace(' ', 'T') + (user.trial_ends_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Upgrade to Pro or Enterprise whenever you want more.
              </p>
            )}
            {user.subscription_status === 'upgrade_due' && (
              <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>
                Your 3-month founding trial is complete. You keep the Free plan — upgrade to Pro or Enterprise for more routes, flexible dates, full price history and more alert channels.
              </p>
            )}
          </div>
          <div className="md:w-72 w-full">
            <div className="flex items-center justify-between mb-1">
              <span className="ed-label" style={{ margin: 0 }}>{t.activeRoutes}</span>
              <span className="ed-mono" style={{ color: 'var(--ink-soft)' }}>
                {activeRoutes} / {tierLimit.maxRoutes === 9999 ? '∞' : tierLimit.maxRoutes}
              </span>
            </div>
            <div className="ed-bar">
              <div
                className={`ed-bar-fill ${usagePct >= 80 ? 'amber' : 'green'}`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {user.tier === 'free' && (
              <a href="/api/billing/checkout" className="ed-btn ed-btn-primary w-full justify-center mt-3">
                {t.upgrade}
              </a>
            )}
          </div>
        </div>
      </section>

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

      <section className="ed-panel">
        <h2 className="ed-h2">{t.manualPoll}</h2>
        <p className="ed-panel-note" style={{ marginBottom: 12 }}>{t.manualPollSub}</p>
        <PollNowButton label={t.pollAll} />
      </section>

      <PieCard
        title={fill(t.apiUsage, { n: QUOTA })}
        data={quotaPie}
        valueLabel={t.calls}
      />

      <section className="ed-panel overflow-x-auto">
        <div className="ed-panel-head">
          <h2 className="ed-panel-title">{t.recentAlerts}</h2>
          <a href="/api/alerts/export" className="ed-btn ed-btn-secondary" title={t.exportTitle}>
            {t.exportCsv}
          </a>
        </div>
        {recent.length === 0 ? (
          <p className="ed-panel-note" style={{ textAlign: 'center', padding: '24px 0', margin: 0 }}>{t.noAlerts}</p>
        ) : (
          <table className="ed-table">
            <thead>
              <tr>
                <th>{t.thSent}</th>
                <th>{t.thSearch}</th>
                <th>{t.thDepart}</th>
                <th>{t.thReturn}</th>
                <th className="num">{t.thPerAdult}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(a => (
                <tr key={a.id}>
                  <td style={{ color: 'var(--muted)' }}>{fmtDateTime(a.sent_at)}</td>
                  <td style={{ fontWeight: 600 }}>{a.origin} → {a.destination}</td>
                  <td>{a.depart_date}</td>
                  <td>{a.return_date}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtUSD(a.price_per_adult_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {user.id !== 1 && <DangerZone email={user.email} />}
    </div>
  );
}

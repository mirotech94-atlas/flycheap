import { Suspense } from 'react';
import { APP_VERSION_SHORT } from '@/lib/version';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { LoginForm } from '@/components/LoginForm';
import { getRequestLocale } from '@/lib/i18n/server';
import { getAppDict } from '@/lib/i18n/app';
import { Em } from '@/lib/i18n/rich';
import { headers } from 'next/headers';
import { isAdminHost } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sign in — FlyCheap',
  description: 'Log in to your FlyCheap account to monitor cheap flights and get instant fare alerts.',
};

type LiveStats = {
  snapshots: number;
  routes: number;
  alerts: number;
  cheapest: { route: string; price: number; date: string } | null;
  topDeals: Array<{ route: string; out: string; ret: string; per: number; provider: string }>;
};

function getLiveStats(): LiveStats {
  const empty: LiveStats = { snapshots: 0, routes: 0, alerts: 0, cheapest: null, topDeals: [] };
  try {
    const db = getDb();
    const snapshots = (db.prepare('SELECT COUNT(*) AS n FROM fare_snapshots').get() as { n: number }).n;
    const routes = (db.prepare('SELECT COUNT(DISTINCT origin || destination) AS n FROM best_deals_cache').get() as { n: number }).n;
    const alerts = (db.prepare('SELECT COUNT(*) AS n FROM alerts_sent').get() as { n: number }).n;
    const cheapestRow = db.prepare(
      'SELECT origin, destination, per_adult_usd, outbound_date FROM best_deals_cache ORDER BY per_adult_usd ASC LIMIT 1',
    ).get() as { origin: string; destination: string; per_adult_usd: number; outbound_date: string } | undefined;
    const dealRows = db.prepare(
      `SELECT origin, destination, outbound_date, return_date, per_adult_usd, provider
       FROM best_deals_cache
       GROUP BY origin, destination
       ORDER BY per_adult_usd ASC
       LIMIT 5`,
    ).all() as Array<{ origin: string; destination: string; outbound_date: string; return_date: string; per_adult_usd: number; provider: string }>;
    const fmtDate = (d: string) => {
      const dt = new Date(d + 'T12:00:00Z');
      return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    };
    return {
      snapshots,
      routes,
      alerts,
      cheapest: cheapestRow
        ? { route: `${cheapestRow.origin} → ${cheapestRow.destination}`, price: Math.round(cheapestRow.per_adult_usd), date: fmtDate(cheapestRow.outbound_date) }
        : null,
      topDeals: dealRows.map(r => ({
        route: `${r.origin} → ${r.destination}`,
        out: fmtDate(r.outbound_date),
        ret: fmtDate(r.return_date),
        per: Math.round(r.per_adult_usd),
        provider: r.provider,
      })),
    };
  } catch {
    return empty;
  }
}

export default async function LoginPage() {
  const stats = getLiveStats();
  const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));
  const dict = getAppDict(await getRequestLocale());
  const t = dict.login;
  const h = await headers();
  const adminPortal = isAdminHost(h.get('x-forwarded-host') ?? h.get('host'));

  if (adminPortal) {
    // Founder-only admin portal: one identity, no sign-ups, no marketing panel.
    return (
      <div className="fc-shell fc-admin-login -mx-6 -my-8 -mb-24 md:-mb-8" data-fc-theme="coal" data-fc-accent="gold">
        <div className="fc-admin-login-card">
          <div className="fc-admin-login-brand">
            <svg width="34" height="34" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0a3a6b" /><path d="M52.4 15.8c.6-.6.6-1.7 0-2.3-.6-.6-1.7-.6-2.3 0L37.6 26 17.5 22.5l-3.5 3.5 16.4 7.6L20 43l-7.6-1.4-2.5 2.5 9.7 4.7 4.7 9.7 2.5-2.5L25.4 48l9.4-10.4 7.6 16.4 3.5-3.5L42.4 30.4z" fill="#d4af37" /></svg>
            <div><div className="n">FlyCheap</div><div className="m">Admin portal · founder access</div></div>
          </div>
          <h2>Superadmin <em>sign in</em></h2>
          <p className="sub">This portal is for the founder account only. Codes are only issued to the owner identity; every other email is refused.</p>
          <div className="fc-login-card">
            <Suspense fallback={null}>
              <LoginForm t={t.form} adminOnly />
            </Suspense>
          </div>
          <p className="legal">Every admin action is written to the audit log · <Link href="https://flycheap.18dn.com/welcome">← back to flycheap</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="fc-shell fc-login -mx-6 -my-8 -mb-24 md:-mb-8" data-fc-theme="ivory" data-fc-accent="gold">
      {/* ── Left: live intelligence panel (real data) ── */}
      <div className="fc-login-intel">
        <div className="fc-login-intel-inner">
          <Link href="/welcome" className="fc-l-brand" style={{ color: 'var(--fc-cream)' }}>
            <div className="fc-l-brand-mark" style={{ background: 'rgba(255,255,255,.08)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M5 5 L5 19 M5 5 L14 5 M5 12 L11 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M22 8 A6 6 0 0 0 16 8 A6 6 0 0 0 22 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <div>
              <div className="fc-l-brand-name" style={{ color: 'var(--fc-cream)' }}>FlyCheap</div>
              <div className="fc-l-brand-meta" style={{ color: 'rgba(255,255,255,.5)' }}>{t.brandMeta}</div>
            </div>
          </Link>

          <div className="fc-login-hero">
            <div className="fc-login-pill"><span className="dot" />{t.pill}</div>
            <h1><Em r={t.h1[0]} /><br /><Em r={t.h1[1]} /></h1>
            <p>{t.lede}</p>
          </div>

          <div className="fc-login-stats">
            <div>
              <div className="v">{fmtK(stats.snapshots)}</div>
              <div className="k">{t.statSnapshots}</div>
            </div>
            <div>
              <div className="v">{stats.routes}</div>
              <div className="k">{t.statRoutes}</div>
            </div>
            <div>
              <div className="v">{stats.alerts}</div>
              <div className="k">{t.statAlerts}</div>
            </div>
            {stats.cheapest && (
              <div>
                <div className="v gold">${stats.cheapest.price}</div>
                <div className="k">{t.statCheapest} · {stats.cheapest.route}</div>
              </div>
            )}
          </div>

          {stats.topDeals.length > 0 && (
            <div className="fc-login-deals">
              <div className="fc-login-deals-head">
                <span>{t.dealsHead}</span>
                <span className="tag">{dict.common.live}</span>
              </div>
              <table>
                <thead>
                  <tr><th>{t.thRoute}</th><th>{t.thDates}</th><th>{t.thPerAdult}</th></tr>
                </thead>
                <tbody>
                  {stats.topDeals.map(d => (
                    <tr key={d.route}>
                      <td className="route">{d.route}</td>
                      <td className="dates">{d.out} – {d.ret}</td>
                      <td className="price">${d.per}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="fc-login-deals-foot">
                {t.dealsFoot}
              </div>
            </div>
          )}
        </div>
        <div className="fc-login-intel-foot">FlyCheap · {APP_VERSION_SHORT} · NYC</div>
      </div>

      {/* ── Right: auth panel ── */}
      <div className="fc-login-auth">
        <div className="fc-login-auth-inner">
          <div className="fc-smallcaps" style={{ marginBottom: 6 }}>{t.welcomeBack}</div>
          <h2><Em r={t.h2} /></h2>
          <p className="sub">
            {t.sub}
          </p>
          <div className="fc-login-card">
            <Suspense fallback={null}>
              <LoginForm t={t.form} />
            </Suspense>
          </div>
          <p className="legal">
            {t.legalA}<Link href="/privacy">{t.privacy}</Link>
            {t.legalB}<Link href="/trial-terms">{t.trialTerms}</Link>{t.legalC}
          </p>
        </div>
      </div>
    </div>
  );
}

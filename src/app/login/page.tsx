import { Logo } from '@/components/Logo';
import { Suspense } from 'react';
import { APP_VERSION_SHORT } from '@/lib/version';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { LoginForm } from '@/components/LoginForm';
import { getRequestLocale } from '@/lib/i18n/server';
import { getAppDict } from '@/lib/i18n/app';
import { Em } from '@/lib/i18n/rich';
import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAdminHost, getCurrentUser, isOwner, checkDeviceToken, DEVICE_COOKIE } from '@/lib/auth';
import { safeNextPath } from '@/lib/safeNext';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Log in — FlyCheap',
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

export default async function LoginPage(
  { searchParams }: { searchParams?: Promise<{ next?: string; fresh?: string }> },
) {
  const stats = getLiveStats();
  const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));
  const dict = getAppDict(await getRequestLocale());
  const t = dict.login;
  const h = await headers();
  const adminPortal = isAdminHost(h.get('x-forwarded-host') ?? h.get('host'));

  // ── Skip OTP for returning users ──────────────────────────────────────
  // A valid 30-day session, or a 90-day trusted-device cookie, means we
  // already know this browser. Only genuinely new/forgotten devices see the
  // OTP form below.
  const sp = (await searchParams) ?? {};
  const rawNext = typeof sp.next === 'string' ? sp.next : '';
  const nextPath = safeNextPath(rawNext);
  const dest = nextPath || (adminPortal ? '/admin' : '/');
  const existingUser = await getCurrentUser();
  if (existingUser) {
    // On the admin host a signed-in NON-owner (e.g. a client session, which
    // shares the .flycheap.live cookie) must NOT be bounced to the marketing
    // site — that traps them with no way to switch accounts. Fall through to
    // render the admin login form so they can sign in as the owner (submitting
    // the owner's code overwrites the shared cookie with an owner session).
    if (!(adminPortal && !isOwner(existingUser))) {
      redirect(dest);
    }
  }
  if (sp.fresh !== '1') {
    const devCookie = (await cookies()).get(DEVICE_COOKIE)?.value;
    if (devCookie) {
      const devUser = await checkDeviceToken();
      if (devUser && !(adminPortal && !isOwner(devUser))) {
        redirect(`/api/auth/resume?next=${encodeURIComponent(dest)}`);
      }
    }
  }
  // ──────────────────────────────────────────────────────────────────────

  if (adminPortal) {
    // Founder-only admin portal: one identity, no sign-ups, no marketing panel.
    return (
      <div className="ed-panel ed-card">
        <div className="mk-brand" style={{ marginBottom: 22 }}>
          <Logo size={34} />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="mk-brand-name">FlyCheap</span>
            <span className="mk-brand-meta">Admin portal · founder access</span>
          </span>
        </div>
        <h2 className="ed-h2">Superadmin <em>sign in</em></h2>
        <p className="ed-sub">This portal is for the founder account only. Codes are only issued to the owner identity; every other email is refused.</p>
        <Suspense fallback={null}>
          <LoginForm t={t.form} adminOnly />
        </Suspense>
        <p className="ed-panel-note" style={{ marginTop: 18 }}>Every admin action is written to the audit log · <Link href="https://flycheap.live/">← back to flycheap</Link></p>
      </div>
    );
  }

  return (
    <div className="ed-login-grid">
      {/* ── Left: live intelligence panel (real data) ── */}
      <div className="ed-panel">
        <Link href="/" className="mk-brand">
          <Logo size={26} />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="mk-brand-name">FlyCheap</span>
            <span className="mk-brand-meta">{t.brandMeta}</span>
          </span>
        </Link>

        <div className="ed-eyebrow" style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ed-dot" />{t.pill}
        </div>
        <h1 className="ed-h1" style={{ fontSize: 32 }}><Em r={t.h1[0]} /><br /><Em r={t.h1[1]} /></h1>
        <p className="ed-sub">{t.lede}</p>

        <div className="ed-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 0 }}>
          <div className="ed-stat">
            <div className="ed-stat-label">{t.statSnapshots}</div>
            <div className="ed-stat-value" style={{ fontSize: 26 }}>{fmtK(stats.snapshots)}</div>
          </div>
          <div className="ed-stat">
            <div className="ed-stat-label">{t.statRoutes}</div>
            <div className="ed-stat-value" style={{ fontSize: 26 }}>{stats.routes}</div>
          </div>
          <div className="ed-stat">
            <div className="ed-stat-label">{t.statAlerts}</div>
            <div className="ed-stat-value" style={{ fontSize: 26 }}>{stats.alerts}</div>
          </div>
          {stats.cheapest && (
            <div className="ed-stat accent">
              <div className="ed-stat-label">{t.statCheapest} · {stats.cheapest.route}</div>
              <div className="ed-stat-value ed-fare-text" style={{ fontSize: 26 }}>${stats.cheapest.price}</div>
            </div>
          )}
        </div>

        {stats.topDeals.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ed-eyebrow">{t.dealsHead}</span>
              <span className="ed-mono" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="ed-dot" />{dict.common.live}
              </span>
            </div>
            <table className="ed-table" style={{ marginTop: 10 }}>
              <thead>
                <tr><th>{t.thRoute}</th><th>{t.thDates}</th><th className="num">{t.thPerAdult}</th></tr>
              </thead>
              <tbody>
                {stats.topDeals.map(d => (
                  <tr key={d.route}>
                    <td>{d.route}</td>
                    <td>{d.out} – {d.ret}</td>
                    <td className="num ed-fare-text">${d.per}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ed-panel-note" style={{ marginTop: 8 }}>{t.dealsFoot}</p>
          </div>
        )}

        <p className="ed-panel-note" style={{ marginTop: 22 }}>FlyCheap · {APP_VERSION_SHORT} · NYC</p>
      </div>

      {/* ── Right: auth panel ── */}
      <div className="ed-panel">
        <div className="ed-eyebrow">{t.welcomeBack}</div>
        <h2 className="ed-h2" style={{ marginTop: 6 }}><Em r={t.h2} /></h2>
        <p className="ed-sub">
          {t.sub}
        </p>
        <Suspense fallback={null}>
          <LoginForm t={t.form} />
        </Suspense>
        <p className="ed-panel-note" style={{ marginTop: 18 }}>
          {t.legalA}<Link href="/privacy">{t.privacy}</Link>
          {t.legalB}<Link href="/trial-terms">{t.trialTerms}</Link>{t.legalC}
        </p>
      </div>
    </div>
  );
}

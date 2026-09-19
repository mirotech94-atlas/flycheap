import { Logo, LogoMark } from '@/components/Logo';
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
  const nextPath = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '';
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
      <div className="fc-shell fc-admin-login -mx-6 -my-8 -mb-24 md:-mb-8" data-fc-theme="coal" data-fc-accent="gold">
        <div className="fc-admin-login-card">
          <div className="fc-admin-login-brand">
            <Logo size={34} />
            <div><div className="n">FlyCheap</div><div className="m">Admin portal · founder access</div></div>
          </div>
          <h2>Superadmin <em>sign in</em></h2>
          <p className="sub">This portal is for the founder account only. Codes are only issued to the owner identity; every other email is refused.</p>
          <div className="fc-login-card">
            <Suspense fallback={null}>
              <LoginForm t={t.form} adminOnly />
            </Suspense>
          </div>
          <p className="legal">Every admin action is written to the audit log · <Link href="https://flycheap.live/">← back to flycheap</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="fc-shell fc-login -mx-6 -my-8 -mb-24 md:-mb-8" data-fc-theme="cabin" data-fc-accent="gold">
      {/* ── Left: live intelligence panel (real data) ── */}
      <div className="fc-login-intel">
        <div className="fc-login-intel-inner">
          <Link href="/" className="fc-l-brand" style={{ color: 'var(--fc-cream)' }}>
            <div className="fc-l-brand-mark" style={{ background: 'rgba(255,255,255,.08)' }}>
              <LogoMark size={22} />
            </div>
            <div>
              <div className="fc-l-brand-name" style={{ color: 'var(--fc-ink)' }}>FlyCheap</div>
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

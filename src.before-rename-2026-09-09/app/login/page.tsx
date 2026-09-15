import { Suspense } from 'react';
import { APP_VERSION_SHORT } from '@/lib/version';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sign in — FlyCheap Tracker',
  description: 'Log in to your FlyCheap Tracker account to monitor cheap flights and get instant fare alerts.',
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

export default function LoginPage() {
  const stats = getLiveStats();
  const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

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
              <div className="fc-l-brand-name" style={{ color: 'var(--fc-cream)' }}>FlyCheap <em style={{ color: 'var(--fc-gold)' }}>Tracker</em></div>
              <div className="fc-l-brand-meta" style={{ color: 'rgba(255,255,255,.5)' }}>Fare Intelligence Platform</div>
            </div>
          </Link>

          <div className="fc-login-hero">
            <div className="fc-login-pill"><span className="dot" />Live from the fare engine</div>
            <h1>Stop <em>refreshing</em>.<br />Start <em>saving</em>.</h1>
            <p>
              The numbers below are live production data — what the engine is tracking
              at this moment, refreshed every polling cycle.
            </p>
          </div>

          <div className="fc-login-stats">
            <div>
              <div className="v">{fmtK(stats.snapshots)}</div>
              <div className="k">Fare snapshots recorded</div>
            </div>
            <div>
              <div className="v">{stats.routes}</div>
              <div className="k">Route pairs monitored</div>
            </div>
            <div>
              <div className="v">{stats.alerts}</div>
              <div className="k">Alerts delivered</div>
            </div>
            {stats.cheapest && (
              <div>
                <div className="v gold">${stats.cheapest.price}</div>
                <div className="k">Cheapest now · {stats.cheapest.route}</div>
              </div>
            )}
          </div>

          {stats.topDeals.length > 0 && (
            <div className="fc-login-deals">
              <div className="fc-login-deals-head">
                <span>Best round-trips right now</span>
                <span className="tag">LIVE</span>
              </div>
              <table>
                <thead>
                  <tr><th>Route</th><th>Dates</th><th>Per adult</th></tr>
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
                Sign in to set thresholds and get alerted the moment these drop further.
              </div>
            </div>
          )}
        </div>
        <div className="fc-login-intel-foot">FlyCheap Tracker · {APP_VERSION_SHORT} · NYC</div>
      </div>

      {/* ── Right: auth panel ── */}
      <div className="fc-login-auth">
        <div className="fc-login-auth-inner">
          <div className="fc-smallcaps" style={{ marginBottom: 6 }}>Welcome back</div>
          <h2>Log in or <em>sign up</em></h2>
          <p className="sub">
            Returning users are recognized automatically. New here? You&apos;re 30 seconds
            from your first tracked route — one 6-digit email code, no password.
          </p>
          <div className="fc-login-card">
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </div>
          <p className="legal">
            By continuing you agree to our <Link href="/privacy">privacy policy</Link>
            {' '}and, for Pro trials, the <Link href="/trial-terms">trial terms</Link>. We never sell your data.
          </p>
        </div>
      </div>
    </div>
  );
}

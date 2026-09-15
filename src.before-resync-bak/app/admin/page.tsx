import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';
import { fmtUSD } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin');
  const allowList = (process.env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const isAdmin = user.id === 1 || allowList.includes(user.email.toLowerCase());
  if (!isAdmin) redirect('/');

  const m = queries.adminMetrics();

  const tiles: Array<{ label: string; value: string | number; sub?: string; accent?: string }> = [
    { label: 'Total signups', value: m.users.total, sub: `+${m.signups.last7d} last 7d · +${m.signups.last30d} last 30d`, accent: 'kpi-brand' },
    { label: 'MRR (estimated)', value: fmtUSD(m.mrr_usd), sub: `${m.users.pro} Pro · ${m.users.enterprise} Enterprise`, accent: 'kpi-accent' },
    { label: 'Conversion', value: `${m.conversion_pct}%`, sub: `paying / total signups` },
    { label: 'Active routes', value: m.active_searches, sub: `${m.alerts_sent_7d} alerts sent in 7d` },
  ];

  return (
    <div className="space-y-6">
      <div className="motion-fade-in">
        <div className="eyebrow mb-1">Admin</div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight font-display">
          Revenue &amp; growth
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Live snapshot for {user.email}. Visible only to admin emails (set <code>ADMIN_EMAILS</code>).
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 motion-slide-up">
        {tiles.map(t => (
          <div key={t.label} className={`kpi ${t.accent ?? ''}`}>
            <div className="kpi-label">{t.label}</div>
            <div className="kpi-value">{t.value}</div>
            {t.sub && <div className="kpi-sub">{t.sub}</div>}
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 motion-slide-up motion-delay-1">
        {[
          { tier: 'free',       count: m.users.free,       price: 0,  color: 'bg-slate-500' },
          { tier: 'pro',        count: m.users.pro,        price: 9,  color: 'bg-emerald-500' },
          { tier: 'enterprise', count: m.users.enterprise, price: 49, color: 'bg-amber-500' },
        ].map(b => (
          <div key={b.tier} className="card">
            <div className="flex items-center justify-between">
              <div>
                <div className="eyebrow">{b.tier}</div>
                <div className="font-display font-bold text-3xl mt-1 tabular">{b.count}</div>
                <div className="text-xs text-slate-500 mt-0.5">accounts</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 uppercase tracking-wide">${b.price}/mo each</div>
                <div className="font-bold tabular text-emerald-700 mt-1">{fmtUSD(b.count * b.price)}</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className={`h-full ${b.color}`} style={{ width: `${m.users.total ? (b.count / m.users.total) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
      </section>

      <section className="card motion-slide-up motion-delay-2">
        <h2>Conversion funnel · last 30 days</h2>
        <div className="text-sm text-slate-500 mb-3">Simple model — assumes signups - paying = trialing/churned.</div>
        <div className="space-y-2">
          {[
            { step: 'Signups (30d)', value: m.signups.last30d, max: Math.max(m.signups.last30d, 1) },
            { step: 'Paying users (Pro + Ent)', value: m.users.pro + m.users.enterprise, max: Math.max(m.signups.last30d, 1) },
            { step: 'Active routes', value: m.active_searches, max: Math.max(m.active_searches, 1) },
            { step: 'Alerts sent (7d)', value: m.alerts_sent_7d, max: Math.max(m.alerts_sent_7d, 1) },
          ].map(s => {
            const pct = Math.min(100, (s.value / s.max) * 100);
            return (
              <div key={s.step} className="flex items-center gap-3">
                <div className="w-48 text-xs text-slate-600 dark:text-slate-300">{s.step}</div>
                <div className="flex-1 h-6 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden">
                  <div className="h-full bg-brand-gradient flex items-center justify-end px-2 text-[10px] font-semibold text-white tabular" style={{ width: `${pct}%` }}>
                    {s.value}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

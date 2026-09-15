import Link from 'next/link';
import { queries } from '@/lib/db';
import { fmtRelative } from '@/lib/utils';
import { PageHead, Panel, Kpi, BarRow, Table, fmtInt } from '../_components/ui';

export const dynamic = 'force-dynamic';

/** Human labels for the `surface` tag written by /go on every outbound click. */
const SURFACE_LABELS: Record<string, string> = {
  'dashboard-cheapest-card': 'Dashboard · cheapest card',
  'dashboard-tracked-table': 'Dashboard · tracked table',
  'deals-table': 'Deals table',
  'offers-page': 'Offers page',
  'heatmap': 'Fare heatmap',
  'nadia-concierge': 'FarePilot concierge',
  'email-alert': 'Email · price alert',
  'email-digest': 'Email · digest',
  'explore-page': 'Explore page',
  'share-page': 'Public share page',
  'untagged': '(untagged)',
};

export default async function ClickStreamPage() {
  const stats = queries.monthlyAffiliateStats();
  const bySurface = queries.clicksBySurface30d();
  const byProvider = queries.clicksByProvider30d();
  const topRoutes = queries.topRoutesByClicks30d(12);
  const recent = queries.recentAffiliateClicks(40);
  const daily = queries.dailyClicksAndRevenue90d();

  const last7 = daily.slice(-7).reduce((s, d) => s + d.clicks, 0);
  const maxSurface = Math.max(1, ...bySurface.map(r => r.clicks));
  const maxProvider = Math.max(1, ...byProvider.map(r => r.clicks));
  const maxRoute = Math.max(1, ...topRoutes.map(r => r.clicks));
  const topSurface = bySurface[0];
  const topProgram = byProvider[0];

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Commercial · attribution"
        title="Click stream"
        sub="Every outbound booking click logged by the /go redirect — which surfaces send traffic, which programs receive it, and which routes travellers actually click."
        right={<Link href="/admin/revenue" className="ad-btn ad-btn-gold">Revenue &amp; earnings →</Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Clicks · 30d" value={fmtInt(stats.clicks_30d)} spark={daily.slice(-30).map(d => d.clicks)} />
        <Kpi label="Clicks · 7d" value={fmtInt(last7)} foot={`${(last7 / 7).toFixed(1)} per day average`} />
        <Kpi
          label="Top surface" value={topSurface ? fmtInt(topSurface.clicks) : '—'} tone="gold"
          foot={topSurface ? (SURFACE_LABELS[topSurface.surface] ?? topSurface.surface) : 'No clicks logged yet'}
        />
        <Kpi
          label="Top program" value={topProgram ? fmtInt(topProgram.clicks) : '—'}
          foot={topProgram ? topProgram.provider : 'No clicks logged yet'}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <Panel title="Clicks by surface · 30d" sub="Where in the product the click happened">
          {bySurface.length === 0
            ? <Empty>No clicks logged yet.</Empty>
            : bySurface.map(r => (
              <BarRow
                key={r.surface}
                label={SURFACE_LABELS[r.surface] ?? r.surface}
                value={r.clicks} max={maxSurface}
              />
            ))}
        </Panel>

        <Panel title="Clicks by program · 30d" sub="Which partner received the traffic">
          {byProvider.length === 0
            ? <Empty>No clicks logged yet.</Empty>
            : byProvider.map(r => (
              <BarRow key={r.provider} label={r.provider} value={r.clicks} max={maxProvider} tone="gold" />
            ))}
        </Panel>
      </div>

      <Panel title="Top routes by clicks · 30d" sub="The itineraries travellers are actually trying to book">
        {topRoutes.length === 0
          ? <Empty>No clicks yet.</Empty>
          : (
            <div className="grid md:grid-cols-2 gap-x-8">
              {topRoutes.map(r => (
                <BarRow key={r.route} label={<span className="font-mono text-[12px]">{r.route}</span>} value={r.clicks} max={maxRoute} tone="good" />
              ))}
            </div>
          )}
      </Panel>

      <Panel title="Recent clicks" sub={`Last ${recent.length} outbound click${recent.length === 1 ? '' : 's'}`}>
        {recent.length === 0 ? <Empty>No recent clicks.</Empty> : (
          <Table head={['When', 'Surface', 'Program', 'Route', 'Marker']}>
            {recent.map(r => {
              const surface = (r as { surface?: string | null }).surface ?? null;
              return (
                <tr key={r.id}>
                  <td className="text-white/50 whitespace-nowrap">{fmtRelative(r.occurred_at + 'Z')}</td>
                  <td>{surface ? (SURFACE_LABELS[surface] ?? surface) : <span className="text-white/30">—</span>}</td>
                  <td>{r.provider ?? <span className="text-white/30">—</span>}</td>
                  <td className="font-mono text-[11.5px]">{r.origin && r.destination ? `${r.origin} → ${r.destination}` : '—'}</td>
                  <td className="font-mono text-[10.5px] text-white/40">{r.marker ?? '—'}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      <p className="text-[11.5px] text-white/35 leading-relaxed">
        Clicks are recorded server-side by <code>/go</code> before the redirect, so ad-blockers cannot skew them.
        Commission and earnings figures live on the <Link href="/admin/revenue" className="text-white/60 underline">Revenue</Link> page.
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-[12.5px] text-white/35">{children}</div>;
}

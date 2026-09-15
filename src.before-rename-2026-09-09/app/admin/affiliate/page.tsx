import { queries } from '@/lib/db';
import { fmtUSD, fmtRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AffiliatePage() {
  const stats     = queries.monthlyAffiliateStats();
  const provider  = queries.clicksByProvider30d();
  const surface   = queries.clicksBySurface30d();
  const partner   = queries.commissionsByPartner30d();
  const recent    = queries.recentAffiliateClicks(25);
  const topRoutes = queries.topRoutesByClicks30d(10);

  const epc = stats.clicks_30d > 0 ? stats.revenue_30d / stats.clicks_30d : 0;

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#d4af37] mb-1">Admin · affiliate</div>
        <h1 className="text-3xl font-bold tracking-tight">Affiliate</h1>
        <p className="text-sm text-white/55 mt-1">Clicks, commissions, and conversion across surfaces · last 30 days.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Clicks · 30d"   value={stats.clicks_30d.toLocaleString()} />
        <Tile label="Bookings · 30d" value={stats.commissions_30d.toLocaleString()} />
        <Tile label="Revenue · 30d"  value={fmtUSD(stats.revenue_30d)} accent />
        <Tile label="EPC"            value={fmtUSD(epc)} sub="rev ÷ clicks" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Table title="Clicks by program" rows={provider.map(r => ({ k: r.provider, v: r.clicks.toLocaleString() }))} />
        <Table title="Clicks by surface" rows={surface.map(r => ({ k: r.surface, v: r.clicks.toLocaleString() }))} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl p-4 border border-white/6 bg-[#0f1f3a]">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-3">Commissions by partner · 30d</div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-white/45"><th>Partner</th><th className="text-right">Bookings</th><th className="text-right">Revenue</th></tr></thead>
            <tbody>
              {partner.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-white/50">No commissions yet.</td></tr>}
              {partner.map(p => (
                <tr key={p.partner} className="border-t border-white/5">
                  <td className="py-1.5">{p.partner}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.bookings}</td>
                  <td className="py-1.5 text-right tabular-nums text-emerald-300">{fmtUSD(p.revenue_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Table title="Top routes by clicks · 30d" rows={topRoutes.map(r => ({ k: r.route, v: r.clicks.toLocaleString() }))} mono />
      </div>

      <div className="rounded-xl p-4 border border-white/6 bg-[#0f1f3a] overflow-x-auto">
        <div className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-3">Recent clicks</div>
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/45">
              <th>When</th><th>Surface</th><th>Provider</th><th>Route</th><th>Marker</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-white/50">No clicks yet.</td></tr>}
            {recent.map(r => {
              const s = (r as { surface?: string | null }).surface ?? null;
              return (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="py-1.5 text-xs text-white/55">{fmtRelative(r.occurred_at + 'Z')}</td>
                  <td className="py-1.5 text-xs">{s ?? '—'}</td>
                  <td className="py-1.5 text-xs">{r.provider ?? '—'}</td>
                  <td className="py-1.5 text-xs font-mono">{r.origin && r.destination ? `${r.origin} → ${r.destination}` : '—'}</td>
                  <td className="py-1.5 text-[10px] font-mono text-white/45">{r.marker ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl p-4 border"
         style={{
           background: accent ? 'linear-gradient(135deg, rgba(212,175,55,0.10), rgba(15,31,58,1))' : '#0f1f3a',
           borderColor: accent ? 'rgba(212,175,55,0.25)' : 'rgba(255,255,255,0.06)',
         }}>
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/50">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-white/45 mt-0.5">{sub}</div>}
    </div>
  );
}

function Table({ title, rows, mono }: { title: string; rows: Array<{ k: string; v: string }>; mono?: boolean }) {
  return (
    <div className="rounded-xl p-4 border border-white/6 bg-[#0f1f3a]">
      <div className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-3">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.length === 0 && <tr><td className="py-3 text-center text-white/50">No data.</td></tr>}
          {rows.map(r => (
            <tr key={r.k} className="border-t border-white/5 first:border-t-0">
              <td className={`py-1.5 ${mono ? 'font-mono text-xs' : ''}`}>{r.k}</td>
              <td className="py-1.5 text-right tabular-nums">{r.v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

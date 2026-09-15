import { queries } from '@/lib/db';
import { fmtRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SignupsPage() {
  const m = queries.adminMetrics();
  const today  = queries.signupsToday();
  const last7  = queries.signupsLastNDays(7);
  const last30 = queries.signupsLastNDays(30);
  const daily  = queries.signupsByDay(90);
  const users  = queries.listAllUsers().slice(0, 50);

  const total = m.users.total || 1;
  const free  = m.users.free;
  const pro   = m.users.pro;
  const ent   = m.users.enterprise;

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#d4af37] mb-1">Admin · signups</div>
        <h1 className="text-3xl font-bold tracking-tight">Signups</h1>
        <p className="text-sm text-white/55 mt-1">Acquisition + tier funnel for the FlyCheap Tracker user base.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Today"     value={today} />
        <Tile label="Last 7d"   value={last7} />
        <Tile label="Last 30d"  value={last30} />
        <Tile label="All-time"  value={m.users.total} accent />
      </div>

      <div className="rounded-xl p-4 border border-white/6 bg-[#0f1f3a]">
        <div className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-3">Daily signups · last 90 days</div>
        <Chart data={daily} />
      </div>

      <div className="rounded-xl p-4 border border-white/6 bg-[#0f1f3a]">
        <div className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-3">Tier funnel</div>
        <FunnelRow label="All signups" value={total} max={total} color="#1f5fa5" />
        <FunnelRow label="Free"        value={free}  max={total} color="#64748b" />
        <FunnelRow label="Pro"         value={pro}   max={total} color="#10b981" />
        <FunnelRow label="Enterprise"  value={ent}   max={total} color="#d4af37" />
      </div>

      <div className="rounded-xl border border-white/6 bg-[#0f1f3a] overflow-hidden">
        <div className="px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-white/50 border-b border-white/5">
          50 newest signups
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/45">
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2">Joined</th>
              <th className="px-4 py-2 text-right">Routes</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-white/5">
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px] ${
                    u.tier === 'enterprise' ? 'bg-[#d4af37]/20 text-[#f0d674]' :
                    u.tier === 'pro'        ? 'bg-emerald-500/20 text-emerald-300' :
                    'bg-white/10 text-white/60'
                  }`}>{u.tier}</span>
                </td>
                <td className="px-4 py-2 text-xs text-white/55">{fmtRelative(u.created_at + 'Z')}</td>
                <td className="px-4 py-2 text-right tabular-nums">{u.active_searches}/{u.total_searches}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        background: accent ? 'linear-gradient(135deg, rgba(212,175,55,0.10), rgba(15,31,58,1))' : '#0f1f3a',
        borderColor: accent ? 'rgba(212,175,55,0.25)' : 'rgba(255,255,255,0.06)',
      }}
    >
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/50">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function FunnelRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-32 text-xs text-white/60">{label}</div>
      <div className="flex-1 h-6 bg-white/5 rounded-md overflow-hidden">
        <div className="h-full flex items-center justify-end px-2 text-[10px] font-semibold text-white tabular-nums"
             style={{ width: `${pct}%`, background: color }}>
          {value}
        </div>
      </div>
      <div className="w-12 text-right text-xs text-white/50 tabular-nums">{pct.toFixed(0)}%</div>
    </div>
  );
}

function Chart({ data }: { data: Array<{ day: string; n: number }> }) {
  if (data.length === 0) {
    return <div className="py-8 text-center text-sm text-white/50">No data.</div>;
  }
  const max = Math.max(1, ...data.map(d => d.n));
  return (
    <div className="flex items-end gap-[2px] h-32">
      {data.map(d => (
        <div
          key={d.day}
          title={`${d.day} · ${d.n} signup${d.n === 1 ? '' : 's'}`}
          className="flex-1 rounded-t-sm"
          style={{ height: `${(d.n / max) * 100}%`, minHeight: 2, background: '#d4af37' }}
        />
      ))}
    </div>
  );
}

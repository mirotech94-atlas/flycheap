import { queries } from '@/lib/db';
import { fmtRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  const hourly  = queries.providerHealthHourly(24);
  const latency = queries.providerLatencyPercentiles(24);
  const errs    = queries.errorMessageGroups(24, 20);
  const slow    = queries.slowestPolls(24, 10);
  const jobs    = queries.jobRunsSummary();

  const total24h = hourly.reduce((s, r) => s + r.ok_count + r.err_count, 0);
  const err24h   = hourly.reduce((s, r) => s + r.err_count, 0);
  const errRate  = total24h > 0 ? (err24h / total24h) * 100 : 0;

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#d4af37] mb-1">Admin · health</div>
        <h1 className="text-3xl font-bold tracking-tight">Operational health</h1>
        <p className="text-sm text-white/55 mt-1">Provider uptime, error rate, and slow polls in the last 24h.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="API calls · 24h" value={total24h} />
        <Tile label="Errors · 24h"    value={err24h} tone={err24h > 0 ? 'down' : 'up'} />
        <Tile label="Error rate"      value={`${errRate.toFixed(2)}%`} tone={errRate > 5 ? 'down' : 'up'} />
        <Tile label="Active jobs"     value={jobs.length} />
      </div>

      <div className="rounded-xl p-4 border border-white/6 bg-[#0f1f3a]">
        <div className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-3">API hourly · last 24h</div>
        <div className="flex items-end gap-[2px] h-16">
          {hourly.map(r => {
            const total = r.ok_count + r.err_count;
            const errPct = total > 0 ? (r.err_count / total) * 100 : 0;
            const color = total === 0 ? 'rgba(255,255,255,0.06)'
              : errPct === 0 ? '#10b981'
              : errPct < 25  ? '#facc15'
              : '#f43f5e';
            return (
              <div key={r.hour} title={`${r.hour} · ${r.ok_count} ok · ${r.err_count} err`}
                   className="flex-1 rounded-sm"
                   style={{ background: color, height: total > 0 ? '100%' : '20%' }} />
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl p-4 border border-white/6 bg-[#0f1f3a]">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-3">Latency · last 24h</div>
          {latency.n === 0 ? (
            <div className="py-3 text-center text-white/50 text-sm">No data.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="p50" value={`${Math.round(latency.p50)}ms`} />
              <Stat label="p95" value={`${Math.round(latency.p95)}ms`} />
              <Stat label="p99" value={`${Math.round(latency.p99)}ms`} />
              <Stat label="max" value={`${Math.round(latency.max)}ms`} />
            </div>
          )}
          <div className="text-[11px] text-white/40 mt-3">over {latency.n.toLocaleString()} api calls</div>
        </div>

        <div className="rounded-xl p-4 border border-white/6 bg-[#0f1f3a]">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-3">Cron jobs</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-white/45">
                <th>Job</th><th className="text-right">OK</th><th className="text-right">Err</th><th className="text-right">Avg ms</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-white/50">No runs yet.</td></tr>}
              {jobs.map(j => (
                <tr key={j.id} className="border-t border-white/5">
                  <td className="py-1.5 font-mono text-xs">{j.job}</td>
                  <td className="py-1.5 text-right tabular-nums text-emerald-300">{j.ok_24h}</td>
                  <td className="py-1.5 text-right tabular-nums text-rose-400">{j.err_24h}</td>
                  <td className="py-1.5 text-right tabular-nums text-white/55">{j.avg_ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl p-4 border border-white/6 bg-[#0f1f3a]">
        <div className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-3">Top error groups · 24h</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/45">
              <th>Message</th><th>Level</th><th>Source</th><th className="text-right">Count</th><th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {errs.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-white/50">No errors. 🎉</td></tr>}
            {errs.map((e, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="py-1.5 text-xs">{e.prefix}</td>
                <td className="py-1.5 text-xs">{e.level}</td>
                <td className="py-1.5 text-xs font-mono text-white/55">{e.source ?? '—'}</td>
                <td className="py-1.5 text-right tabular-nums">{e.n}</td>
                <td className="py-1.5 text-xs text-white/55">{fmtRelative(e.last_seen + 'Z')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl p-4 border border-white/6 bg-[#0f1f3a]">
        <div className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-3">Slowest polls · 24h</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/45">
              <th>When</th><th>Route</th><th>Status</th><th className="text-right">ms</th><th>Error</th>
            </tr>
          </thead>
          <tbody>
            {slow.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-white/50">No slow polls.</td></tr>}
            {slow.map(p => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="py-1.5 text-xs text-white/55">{fmtRelative(p.called_at + 'Z')}</td>
                <td className="py-1.5 text-xs font-mono">{p.origin && p.destination ? `${p.origin} → ${p.destination}` : '—'}</td>
                <td className="py-1.5 text-xs">{p.ok ? <span className="text-emerald-300">ok</span> : <span className="text-rose-400">err</span>}</td>
                <td className="py-1.5 text-right tabular-nums">{p.ms ?? '—'}</td>
                <td className="py-1.5 text-xs text-white/55 truncate max-w-xs">{p.error ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: 'up' | 'down' }) {
  const c = tone === 'up' ? '#34d399' : tone === 'down' ? '#fb7185' : '#fff';
  return (
    <div className="rounded-xl p-4 border border-white/6 bg-[#0f1f3a]">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/50">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: c }}>{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/3 border border-white/6 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/45">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

import Link from 'next/link';
import { getDb, queries } from '@/lib/db';
import { PageHead, Panel, Kpi, Table, Status, BarRow, fmtInt, ago, minutesSince, type Tone } from '../_components/ui';
import { ArchiveButton } from './ArchiveButton';

export const dynamic = 'force-dynamic';

export default async function FareEnginePage() {
  const db = getDb();
  const hourly = queries.providerHealthHourly(24);
  const latency = queries.providerLatencyPercentiles(24);
  const errs = queries.errorMessageGroups(24, 12);
  const slow = queries.slowestPolls(24, 10);

  const total24h = hourly.reduce((s, r) => s + r.ok_count + r.err_count, 0);
  const err24h = hourly.reduce((s, r) => s + r.err_count, 0);
  const errRate = total24h > 0 ? (err24h / total24h) * 100 : 0;

  // Polling throughput — snapshots written per hour for the last 24h.
  const snapHourly = db.prepare(
    `SELECT strftime('%Y-%m-%dT%H', polled_at) AS hour, COUNT(*) AS n
       FROM fare_snapshots WHERE polled_at >= datetime('now','-24 hours')
      GROUP BY hour ORDER BY hour`).all() as Array<{ hour: string; n: number }>;
  const snapMax = Math.max(1, ...snapHourly.map(r => r.n));
  const snaps24h = snapHourly.reduce((s, r) => s + r.n, 0);

  // Route coverage grid — is every active route actually being polled?
  const coverage = db.prepare(
    `SELECT s.id, s.origin, s.destination, s.depart_date, s.return_date, s.user_id,
            s.target_per_adult_usd AS target,
            (SELECT COUNT(*) FROM fare_snapshots f WHERE f.search_id = s.id) AS snaps,
            (SELECT MAX(f.polled_at) FROM fare_snapshots f WHERE f.search_id = s.id) AS last_poll,
            (SELECT MIN(f.price_per_adult_usd) FROM fare_snapshots f
              WHERE f.search_id = s.id AND f.polled_at >= datetime('now','-30 days')) AS low30
       FROM searches s WHERE s.active = 1
      ORDER BY last_poll IS NULL DESC, last_poll ASC`).all() as Array<{
        id: number; origin: string; destination: string; depart_date: string; return_date: string;
        user_id: number; target: number | null; snaps: number; last_poll: string | null; low30: number | null;
      }>;

  const lastPoll = (db.prepare(`SELECT MAX(polled_at) AS t FROM fare_snapshots`).get() as { t: string | null }).t;
  const pollMin = minutesSince(lastPoll);
  const pollTone: Tone = pollMin == null ? 'bad' : pollMin > 90 ? 'bad' : pollMin > 45 ? 'warn' : 'good';
  const p95 = Math.round(latency.p95 ?? 0);
  const stale = coverage.filter(r => {
    const m = minutesSince(r.last_poll);
    return m == null || m > 120;
  }).length;

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Operations · fare engine"
        title="Fare engine"
        sub="Polling throughput, provider reliability and per-route coverage over the last 24 hours. Everything an alert depends on is measured here."
        right={
          <>
            <Status tone={pollTone}>{pollTone === 'good' ? 'Polling normally' : pollTone === 'warn' ? 'Polling slow' : 'Polling stalled'}</Status>
            <Link href="/admin/settings" className="ad-btn">Tune cadence →</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Fares recorded · 24h" value={fmtInt(snaps24h)} tone={pollTone}
          spark={snapHourly.map(r => r.n)} foot={lastPoll ? `Last write ${ago(lastPoll)}` : 'No snapshots yet'} />
        <Kpi label="Provider calls · 24h" value={fmtInt(total24h)}
          foot={`${fmtInt(err24h)} error${err24h === 1 ? '' : 's'}`} />
        <Kpi label="Error rate · 24h" value={`${errRate.toFixed(2)}%`}
          tone={errRate > 5 ? 'bad' : errRate > 1 ? 'warn' : 'good'}
          foot={errRate === 0 ? 'Every provider call succeeded' : 'Share of calls that failed'} />
        <Kpi label="Routes stale > 2h" value={fmtInt(stale)}
          tone={stale > 0 ? 'warn' : 'good'}
          foot={`${coverage.length} active route${coverage.length === 1 ? '' : 's'} · p95 ${p95}ms`} />
      </div>

      {/* ── Throughput graph ── */}
      <Panel title="Polling throughput · last 24h" sub="Fare snapshots written per hour — flat bars mean the engine stopped">
        {snapHourly.length === 0 ? (
          <Empty>No snapshots in the last 24 hours.</Empty>
        ) : (
          <>
            <div className="flex items-end gap-[3px] h-28 mt-1">
              {snapHourly.map(r => {
                const pct = Math.max(3, Math.round((r.n / snapMax) * 100));
                return (
                  <div key={r.hour} className="flex-1 h-full flex items-end" title={`${r.hour.replace('T', ' ')}:00 — ${r.n} snapshots`}>
                    <div className="w-full rounded-t transition-all"
                      style={{ height: `${pct}%`, background: 'linear-gradient(180deg,#d4af37,#8a6d1a)' }} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] font-mono text-white/35 mt-2">
              <span>{snapHourly[0]?.hour.replace('T', ' ')}:00</span>
              <span>peak {snapMax}/h</span>
              <span>{snapHourly[snapHourly.length - 1]?.hour.replace('T', ' ')}:00</span>
            </div>
          </>
        )}
      </Panel>

      {/* ── Provider reliability graph + latency grid ── */}
      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <Panel title="Provider calls · last 24h" sub="Green hour = every call succeeded, red = failures">
          {hourly.length === 0 ? <Empty>No provider calls recorded.</Empty> : (
            <>
              <div className="flex items-end gap-[3px] h-24 mt-1">
                {hourly.map((r, i) => {
                  const t = r.ok_count + r.err_count;
                  const errPct = t > 0 ? (r.err_count / t) * 100 : 0;
                  const max = Math.max(1, ...hourly.map(x => x.ok_count + x.err_count));
                  const color = t === 0 ? 'rgba(255,255,255,0.06)'
                    : errPct === 0 ? '#10b981' : errPct < 25 ? '#facc15' : '#f43f5e';
                  return (
                    <div key={i} className="flex-1 h-full flex items-end" title={`${t} calls · ${r.err_count} errors`}>
                      <div className="w-full rounded-t" style={{ height: `${Math.max(3, (t / max) * 100)}%`, background: color }} />
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] font-mono text-white/35 mt-2">24 hours · {fmtInt(total24h)} calls</div>
            </>
          )}
        </Panel>

        <Panel title="Provider latency · 24h" sub="How long a fare lookup takes end to end">
          {!latency.n ? <Empty>No latency samples yet.</Empty> : (
            <>
              <div className="grid grid-cols-4 gap-2 mb-1">
                {([['p50', latency.p50, 'Typical'], ['p95', latency.p95, 'Slow tail'], ['p99', latency.p99, 'Worst 1%'], ['max', latency.max, 'Peak']] as Array<[string, number, string]>).map(([k, v, note]) => (
                  <div key={k} className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5">
                    <div className="ad-eyebrow text-white/40">{k}</div>
                    <div className="font-mono tabular-nums text-[17px] text-white mt-1">{Math.round(v ?? 0)}<span className="text-[11px] text-white/40 ml-0.5">ms</span></div>
                    <div className="text-[10.5px] text-white/35 mt-0.5">{note}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-white/35 mt-2">
                Measured across {fmtInt(latency.n)} provider call{latency.n === 1 ? '' : 's'} in the last 24 hours.
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* ── Route coverage grid ── */}
      <Panel
        id="coverage"
        title="Route coverage"
        sub="Every active route, when it was last polled, and the cheapest fare seen in 30 days"
        right={<span className="text-[11px] font-mono text-white/35">{coverage.length} active</span>}
      >
        {coverage.length === 0 ? <Empty>No active routes.</Empty> : (
          <Table head={['Route', 'Travel dates', 'Target', '30d low', 'Snapshots', 'Last polled', 'State', '']}>
            {coverage.map(r => {
              const m = minutesSince(r.last_poll);
              const tone: Tone = m == null ? 'bad' : m > 120 ? 'warn' : 'good';
              const departed = new Date(r.depart_date) < new Date();
              return (
                <tr key={r.id}>
                  <td className="font-mono font-medium text-white/90">{r.origin} → {r.destination}</td>
                  <td className="text-white/55 whitespace-nowrap">{r.depart_date} → {r.return_date}</td>
                  <td className="font-mono tabular-nums">{r.target != null ? `$${Math.round(r.target)}` : <span className="text-white/25">default</span>}</td>
                  <td className="font-mono tabular-nums text-[#f0d674]">{r.low30 != null ? `$${Math.round(r.low30)}` : '—'}</td>
                  <td className="font-mono tabular-nums text-white/50">{fmtInt(r.snaps)}</td>
                  <td className="text-white/50 whitespace-nowrap">{ago(r.last_poll)}</td>
                  <td>
                    {departed
                      ? <Status tone="warn">Departed</Status>
                      : <Status tone={tone}>{tone === 'good' ? 'Fresh' : tone === 'warn' ? 'Stale' : 'Never polled'}</Status>}
                  </td>
                  <td className="text-right">{departed && <ArchiveButton id={r.id} />}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      {/* ── Slow polls + errors ── */}
      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <Panel title="Slowest polls · 24h" sub="Longest provider round-trips">
          {slow.length === 0 ? <Empty>No slow polls recorded.</Empty> : (
            <Table head={['Route', 'Duration', 'Result', 'When']}>
              {slow.map((r, i) => (
                <tr key={i}>
                  <td className="font-mono text-[11.5px]">{r.origin && r.destination ? `${r.origin} → ${r.destination}` : '—'}</td>
                  <td className="font-mono tabular-nums text-amber-300">{fmtInt(r.ms ?? 0)}ms</td>
                  <td>{r.ok ? <Status tone="good">OK</Status> : <Status tone="bad">{r.status_code ?? 'failed'}</Status>}</td>
                  <td className="text-white/45 whitespace-nowrap">{ago(r.called_at)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Error groups · 24h" sub="Distinct failures, most frequent first"
          right={<Link href="/admin/errors" className="ad-btn">All errors →</Link>}>
          {errs.length === 0 ? <Empty>No errors logged in the last 24 hours.</Empty> : (
            <div>
              {errs.map((e, i) => (
                <BarRow
                  key={i}
                  label={<span className="font-mono text-[11.5px]">{e.prefix}</span>}
                  value={e.n ?? 0}
                  max={Math.max(1, ...errs.map(x => x.n ?? 0))}
                  tone="bad"
                />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-[12.5px] text-white/35">{children}</div>;
}

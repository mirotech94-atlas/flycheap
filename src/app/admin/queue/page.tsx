import Link from 'next/link';
import { queries } from '@/lib/db';
import { fmtDate } from '@/lib/utils';
import { approvePost, skipPost } from './actions';
import { Panel, Table, Status, ago, fmtInt, type Tone } from '../_components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Approval queue — Admin' };

type Filter = 'queued' | 'approved' | 'posted' | 'skipped';
const FILTERS: Filter[] = ['queued', 'approved', 'posted', 'skipped'];

export default async function AdminQueuePage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const filter: Filter = (FILTERS as string[]).includes(sp.filter ?? '') ? (sp.filter as Filter) : 'queued';
  const counts = queries.socialQueueCounts();
  const items = queries.socialQueueByStatus(filter, 100);
  // Provenance: the scheduled jobs that actually produce this queue.
  const jobs = queries.jobRunsSummary();
  const PRODUCERS: Record<string, string> = {
    'agent-curator': 'Picks the best live fares and writes a blurb · every 6h',
    'agent-social-poster': 'Turns verified picks into draft posts and queues them here · every 6h, after the curator',
    'agent-storyteller': 'Weekly SEO route stories · Mondays 05:00 ET',
    'agent-insights': 'Daily operator brief emailed to you · 08:00 ET',
    'commissions': 'Pulls the Travelpayouts balance and commission events · daily 06:00 ET',
    'route-intel': 'Per-user route intelligence · nightly',
    'bg-poll': 'Refreshes popular world routes for the explore map · hourly',
  };
  const producerRows = Object.keys(PRODUCERS).map(name => {
    const r = jobs.find(j => j.job === name);
    return { name, hint: PRODUCERS[name], last: r?.started_at ?? null, ok: r?.ok_24h ?? 0, err: r?.err_24h ?? 0 };
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow mb-1">Admin · Queue</div>
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-display">
          Approval queue
        </h1>
        <p className="text-sm text-white/55 mt-1 max-w-3xl leading-relaxed">
          Nothing in this queue was written by a person. Scheduled agents draft each item, then it waits for
          your approval: <strong className="text-white/80">curator</strong> picks the fare →{' '}
          <strong className="text-white/80">verifier</strong> checks it is still live →{' '}
          <strong className="text-white/80">social-poster</strong> drafts the copy →{' '}
          <strong className="text-white/80">you approve</strong> → it posts to the channels. Nothing reaches a
          channel until you approve it.
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Queued" value={counts.queued} sub="awaiting your review" brand />
        <Kpi label="Approved" value={counts.approved} sub="cleared to post" />
        <Kpi label="Posted" value={counts.posted} sub="live on channels" />
        <Kpi label="Skipped" value={counts.skipped + counts.failed} sub="skipped or failed" />
      </section>

      <nav className="flex gap-1 border-b border-white/8">
        {FILTERS.map(f => (
          <Link
            key={f}
            href={`/admin/queue?filter=${f}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm capitalize transition ${
              filter === f ? 'border-[#d4af37] font-semibold text-white' : 'border-transparent text-white/55 hover:text-white/80'
            }`}
          >
            {f} · {f === 'skipped' ? counts.skipped + counts.failed : counts[f]}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="card text-center text-sm text-white/45 py-12">
          Nothing in <span className="capitalize">{filter}</span>. The social-poster agent runs after each curator pass.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const pctNote = item.verifier_flag ? ` · ⚠ ${item.verifier_flag}` : '';
            return (
              <div key={item.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`badge ${item.channel === 'x' ? 'badge-muted' : 'badge-success'}`}>
                        {item.channel === 'x' ? 'X' : 'Telegram'}
                      </span>
                      <span className="text-sm font-semibold text-white">
                        {item.origin} → {item.destination}
                      </span>
                      <span className="text-xs text-white/50">
                        ${Math.round(item.per_adult_usd)}/adult · {fmtDate(item.outbound_date)}–{fmtDate(item.return_date)}
                        {item.trip_length_days ? ` · ${item.trip_length_days}d` : ''}
                      </span>
                      {item.score != null && (
                        <span className="text-[11px] font-bold text-[#f0d674]">score {Math.round(item.score)}</span>
                      )}
                    </div>
                    <pre className="text-sm text-white/80 whitespace-pre-wrap font-sans bg-black/20 rounded-md p-3 border border-white/5">{item.body}</pre>
                    <div className="text-[11px] text-white/40 mt-1.5">
                      queued {item.created_at}{pctNote}
                      {item.error ? ` · ${item.error}` : ''}
                    </div>
                  </div>

                  {item.status === 'queued' && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <form action={approvePost}>
                        <input type="hidden" name="id" value={item.id} />
                        <button className="text-xs px-3 py-1.5 rounded-md border border-emerald-400/40 bg-emerald-400/10 hover:bg-emerald-400/20 transition text-emerald-300 font-semibold w-full">
                          Approve
                        </button>
                      </form>
                      <form action={skipPost}>
                        <input type="hidden" name="id" value={item.id} />
                        <button className="text-xs px-3 py-1.5 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 transition text-white/70 w-full">
                          Skip
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Panel
        title="Where these come from"
        sub="The scheduled jobs that feed this queue — each runs on a systemd timer on the production server"
      >
        <Table head={['Job', 'What it does', 'Last run', '24h']}>
          {producerRows.map(r => {
            const tone: Tone = r.err > 0 ? 'bad' : r.last ? 'good' : 'neutral';
            return (
              <tr key={r.name}>
                <td className="font-mono text-[11.5px] text-white/90">{r.name}</td>
                <td className="text-white/55 text-[11.5px]">{r.hint}</td>
                <td className="text-white/50 whitespace-nowrap">{r.last ? ago(r.last) : <span className="text-white/25">never</span>}</td>
                <td><Status tone={tone}>{r.err > 0 ? `${fmtInt(r.err)} failed` : r.last ? `${fmtInt(r.ok)} ok` : 'idle'}</Status></td>
              </tr>
            );
          })}
        </Table>
        <p className="text-[11.5px] text-white/35 mt-3 leading-relaxed">
          Fare polling, digests and compaction are handled separately by the in-app scheduler — see{' '}
          <Link href="/admin/health" className="text-white/60 underline">Fare engine</Link>.
        </p>
      </Panel>
    </div>
  );
}

function Kpi({ label, value, sub, brand }: { label: string; value: number; sub: string; brand?: boolean }) {
  return (
    <div className={`kpi${brand ? ' kpi-brand' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>

    </div>
  );
}

import Link from 'next/link';
import { queries } from '@/lib/db';
import { fmtDate } from '@/lib/utils';
import { approvePost, skipPost } from './actions';
import { Panel, Table, Status, Kpi, ago, fmtInt, type Tone } from '../_components/ui';

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
        <div className="ad-eyebrow accent mb-1">Admin · Queue</div>
        <h1 className="ed-h1">
          Approval queue
        </h1>
        <p className="ed-sub max-w-3xl">
          Nothing in this queue was written by a person. Scheduled agents draft each item, then it waits for
          your approval: <strong className="ad-tone-neutral">curator</strong> picks the fare →{' '}
          <strong className="ad-tone-neutral">verifier</strong> checks it is still live →{' '}
          <strong className="ad-tone-neutral">social-poster</strong> drafts the copy →{' '}
          <strong className="ad-tone-neutral">you approve</strong> → it posts to the channels. Nothing reaches a
          channel until you approve it.
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Queued" value={counts.queued} foot="awaiting your review" tone="warn" />
        <Kpi label="Approved" value={counts.approved} foot="cleared to post" />
        <Kpi label="Posted" value={counts.posted} foot="live on channels" />
        <Kpi label="Skipped" value={counts.skipped + counts.failed} foot="skipped or failed" />
      </section>

      <nav className="ad-tabs">
        {FILTERS.map(f => (
          <Link
            key={f}
            href={`/admin/queue?filter=${f}`}
            className={`ad-tab capitalize${filter === f ? ' active' : ''}`}
          >
            {f} · {f === 'skipped' ? counts.skipped + counts.failed : counts[f]}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="ad-panel text-center text-sm py-12 ad-note">
          Nothing in <span className="capitalize">{filter}</span>. The social-poster agent runs after each curator pass.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const pctNote = item.verifier_flag ? ` · ⚠ ${item.verifier_flag}` : '';
            return (
              <div key={item.id} className="ad-panel">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="ad-chip">
                        {item.channel === 'x' ? 'X' : 'Telegram'}
                      </span>
                      <span className="text-sm font-semibold ad-tone-neutral">
                        {item.origin} → {item.destination}
                      </span>
                      <span className="text-xs ad-note">
                        ${Math.round(item.per_adult_usd)}/adult · {fmtDate(item.outbound_date)}–{fmtDate(item.return_date)}
                        {item.trip_length_days ? ` · ${item.trip_length_days}d` : ''}
                      </span>
                      {item.score != null && (
                        <span className="text-[11px] font-bold ad-tone-neutral">score {Math.round(item.score)}</span>
                      )}
                    </div>
                    <pre className="text-sm whitespace-pre-wrap font-sans ed-subpanel ad-tone-neutral">{item.body}</pre>
                    <div className="text-[11px] ad-note mt-1.5">
                      queued {item.created_at}{pctNote}
                      {item.error ? ` · ${item.error}` : ''}
                    </div>
                  </div>

                  {item.status === 'queued' && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <form action={approvePost}>
                        <input type="hidden" name="id" value={item.id} />
                        <button className="ad-btn ad-btn-gold w-full">
                          Approve
                        </button>
                      </form>
                      <form action={skipPost}>
                        <input type="hidden" name="id" value={item.id} />
                        <button className="ad-btn w-full">
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
                <td className="font-mono text-[11.5px] ad-tone-neutral">{r.name}</td>
                <td className="ad-note text-[11.5px]">{r.hint}</td>
                <td className="ad-note whitespace-nowrap">{r.last ? ago(r.last) : <span style={{ color: 'var(--muted-2)' }}>never</span>}</td>
                <td><Status tone={tone}>{r.err > 0 ? `${fmtInt(r.err)} failed` : r.last ? `${fmtInt(r.ok)} ok` : 'idle'}</Status></td>
              </tr>
            );
          })}
        </Table>
        <p className="text-[11.5px] ad-note mt-3 leading-relaxed">
          Fare polling, digests and compaction are handled separately by the in-app scheduler — see{' '}
          <Link href="/admin/health" style={{ color: 'var(--ink)' }} className="underline">Fare engine</Link>.
        </p>
      </Panel>
    </div>
  );
}

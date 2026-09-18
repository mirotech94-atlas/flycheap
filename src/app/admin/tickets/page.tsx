import Link from 'next/link';
import { queries, type TicketStatus } from '@/lib/db';
import { PageHead, Kpi, Panel, Table, Status, ago, type Tone } from '../_components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Support tickets — Admin' };

const STATUS_META: Record<TicketStatus, { label: string; tone: Tone }> = {
  open:        { label: 'Open',        tone: 'gold' },
  in_progress: { label: 'In progress', tone: 'neutral' },
  waiting:     { label: 'Waiting',     tone: 'warn' },
  resolved:    { label: 'Resolved',    tone: 'good' },
};
const FILTERS: Array<TicketStatus | 'all'> = ['all', 'open', 'in_progress', 'waiting', 'resolved'];

export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const active = (FILTERS as string[]).includes(sp.status ?? '') ? (sp.status as TicketStatus | 'all') : 'all';
  const counts = queries.ticketStatusCounts();
  const tickets = queries.listTickets(active === 'all' ? undefined : active, 200);
  const openish = counts.open + counts.in_progress + counts.waiting;

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Operations · Support"
        title="Support tickets"
        sub="Every message a client sends lands here as a tracked ticket. Reply and the customer gets an email — and sees it in their Support tab. Nothing is lost if email hiccups: the thread is the record."
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Needs attention" value={openish} foot="open, in progress or waiting" tone="gold" href="/admin/tickets?status=open" />
        <Kpi label="Open" value={counts.open} foot="no reply yet" />
        <Kpi label="Waiting" value={counts.waiting} foot="on the customer" tone="warn" />
        <Kpi label="Resolved" value={counts.resolved} foot="closed out" tone="good" />
      </section>

      <nav className="flex flex-wrap gap-1 border-b border-white/8">
        {FILTERS.map(f => {
          const label = f === 'all' ? 'All' : STATUS_META[f].label;
          const n = f === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[f];
          return (
            <Link
              key={f}
              href={`/admin/tickets${f === 'all' ? '' : `?status=${f}`}`}
              className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
                active === f ? 'border-[#d4af37] font-semibold text-white' : 'border-transparent text-white/55 hover:text-white/80'
              }`}
            >
              {label} · {n}
            </Link>
          );
        })}
      </nav>

      <Panel>
        {tickets.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-white/80 text-lg font-display">Nothing here — inbox zero.</div>
            <p className="text-sm text-white/45 mt-1.5">
              {active === 'all' ? 'No tickets yet.' : `No ${STATUS_META[active as TicketStatus].label.toLowerCase()} tickets.`} New messages from the contact form and the client Support tab will appear here.
            </p>
          </div>
        ) : (
          <Table head={['Ref', 'Subject', 'Requester', 'Status', 'Last activity', '']}>
            {tickets.map(t => {
              const meta = STATUS_META[t.status];
              const waitingOnUs = t.last_reply_by === 'client';
              return (
                <tr key={t.id}>
                  <td className="font-mono text-[12.5px] text-white/70 whitespace-nowrap">{t.ref}</td>
                  <td className="max-w-[22rem]">
                    <Link href={`/admin/tickets/${t.ref}`} className="text-white/90 hover:text-white font-medium">
                      {t.subject}
                    </Link>
                    <div className="text-[11px] text-white/40 mt-0.5">{t.message_count} message{t.message_count === 1 ? '' : 's'}</div>
                  </td>
                  <td>
                    <div className="text-[13px] text-white/80 truncate max-w-[12rem]">{t.name}</div>
                    <div className="text-[11px] text-white/40 truncate max-w-[12rem]">{t.email}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    <Status tone={meta.tone}>{meta.label}</Status>
                    {waitingOnUs && t.status !== 'resolved' && (
                      <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#f0d674] mt-1">Your move</div>
                    )}
                  </td>
                  <td className="text-[12px] text-white/55 whitespace-nowrap">{ago(t.last_reply_at || t.updated_at)}</td>
                  <td className="text-right">
                    <Link href={`/admin/tickets/${t.ref}`} className="ad-btn">Open</Link>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
    </div>
  );
}

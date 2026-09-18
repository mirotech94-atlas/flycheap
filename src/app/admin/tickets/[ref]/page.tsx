import Link from 'next/link';
import { notFound } from 'next/navigation';
import { queries, type TicketStatus } from '@/lib/db';
import { PageHead, Panel, Status, ago, type Tone } from '../../_components/ui';
import { replyToTicket, setTicketStatus } from '../actions';

export const dynamic = 'force-dynamic';

const STATUS_META: Record<TicketStatus, { label: string; tone: Tone }> = {
  open:        { label: 'Open',        tone: 'gold' },
  in_progress: { label: 'In progress', tone: 'neutral' },
  waiting:     { label: 'Waiting',     tone: 'warn' },
  resolved:    { label: 'Resolved',    tone: 'good' },
};

function fmtWhen(ts: string): string {
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function AdminTicketDetail({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const ticket = queries.getTicketByRef(ref);
  if (!ticket) notFound();
  const messages = queries.getTicketMessages(ticket.id);
  const meta = STATUS_META[ticket.status];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/tickets" className="text-[12px] text-white/45 hover:text-white/80 transition">← All tickets</Link>
      </div>
      <PageHead
        eyebrow={`Ticket ${ticket.ref}`}
        title={ticket.subject}
        sub={`From ${ticket.name} · ${ticket.email}${ticket.user_id ? ` · account #${ticket.user_id}` : ' · not signed in'} · opened ${ago(ticket.created_at)}`}
        right={
          <div className="flex items-center gap-3">
            <Status tone={meta.tone}>{meta.label}</Status>
            {ticket.status === 'resolved' ? (
              <form action={setTicketStatus}>
                <input type="hidden" name="ref" value={ticket.ref} />
                <input type="hidden" name="status" value="open" />
                <button type="submit" className="ad-btn">Reopen</button>
              </form>
            ) : (
              <form action={setTicketStatus}>
                <input type="hidden" name="ref" value={ticket.ref} />
                <input type="hidden" name="status" value="resolved" />
                <button type="submit" className="ad-btn ad-btn-gold">Mark resolved</button>
              </form>
            )}
          </div>
        }
      />

      <div className="grid lg:grid-cols-[1fr_260px] gap-6 items-start">
        {/* Conversation */}
        <div className="space-y-4">
          <Panel title="Conversation" sub={`${messages.length} message${messages.length === 1 ? '' : 's'}`}>
            <div className="space-y-3">
              {messages.map(m => {
                const fromUs = m.author === 'operator';
                return (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-3.5 ${
                      fromUs
                        ? 'border-[#E8A33D]/25 bg-[#E8A33D]/[0.06] ml-6'
                        : 'border-white/[0.08] bg-white/[0.02] mr-6'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className={`text-[11px] font-mono uppercase tracking-wider ${fromUs ? 'text-[#F2C67A]' : 'text-white/50'}`}>
                        {fromUs ? 'FlyCheap' : ticket.name}
                      </span>
                      <span className="text-[11px] text-white/35">{fmtWhen(m.created_at)}</span>
                    </div>
                    <div className="text-[13.5px] text-white/85 leading-relaxed whitespace-pre-wrap">{m.body}</div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Reply */}
          <Panel title="Reply to the customer" sub="Sends an email and posts to the thread. They can reply by email or in their Support tab.">
            <form action={replyToTicket} className="space-y-3">
              <input type="hidden" name="ref" value={ticket.ref} />
              <textarea
                name="body"
                required
                rows={5}
                placeholder={`Write your reply to ${ticket.name.split(' ')[0]}…`}
                className="w-full rounded-lg bg-[#131C2E] border border-white/10 px-3.5 py-3 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-[#E8A33D]/50 resize-y"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] text-white/40">Goes to {ticket.email}</span>
                <button type="submit" className="ad-btn ad-btn-gold">Send reply</button>
              </div>
            </form>
          </Panel>
        </div>

        {/* Status rail */}
        <Panel title="Status">
          <div className="space-y-2">
            {(['open', 'in_progress', 'waiting', 'resolved'] as TicketStatus[]).map(s => {
              const sm = STATUS_META[s];
              const isCurrent = ticket.status === s;
              return (
                <form action={setTicketStatus} key={s}>
                  <input type="hidden" name="ref" value={ticket.ref} />
                  <input type="hidden" name="status" value={s} />
                  <button
                    type="submit"
                    disabled={isCurrent}
                    className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-[13px] transition ${
                      isCurrent
                        ? 'border-[#E8A33D]/40 bg-[#E8A33D]/[0.08] text-white cursor-default'
                        : 'border-white/[0.08] text-white/70 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <Status tone={sm.tone}>{sm.label}</Status>
                    {isCurrent && <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">current</span>}
                  </button>
                </form>
              );
            })}
          </div>
          <p className="text-[11.5px] text-white/40 mt-3 leading-snug">
            Set <span className="text-white/70">Waiting</span> when the ball is in the customer&apos;s court — their next reply reopens it automatically.
          </p>
        </Panel>
      </div>
    </div>
  );
}

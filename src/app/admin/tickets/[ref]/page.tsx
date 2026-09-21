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
        <Link href="/admin/tickets" className="text-[12px] ad-note transition">← All tickets</Link>
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
                    className={`ad-thread-msg ${fromUs ? 'ours ml-6' : 'theirs mr-6'}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: fromUs ? 'var(--accent)' : 'var(--muted)' }}>
                        {fromUs ? 'FlyCheap' : ticket.name}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{fmtWhen(m.created_at)}</span>
                    </div>
                    <div className="text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{m.body}</div>
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
                className="ed-input resize-y"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] ad-note">Goes to {ticket.email}</span>
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
                    className={`ad-statuspick${isCurrent ? ' active' : ''}`}
                  >
                    <Status tone={sm.tone}>{sm.label}</Status>
                    {isCurrent && <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>current</span>}
                  </button>
                </form>
              );
            })}
          </div>
          <p className="text-[11.5px] ad-note mt-3 leading-snug">
            Set <span className="ad-tone-neutral">Waiting</span> when the ball is in the customer&apos;s court — their next reply reopens it automatically.
          </p>
        </Panel>
      </div>
    </div>
  );
}

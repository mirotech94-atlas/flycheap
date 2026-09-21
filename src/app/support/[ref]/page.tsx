import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { queries, type TicketStatus } from '@/lib/db';
import { clientReply } from '../actions';
import { FcPageHead } from '@/components/fc/PageKit';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open', in_progress: 'In progress', waiting: 'Waiting on you', resolved: 'Resolved',
};
/** Same fold as support/page.tsx (task 2.11c): four backend statuses read as
 *  the three editorial.css chip variants. */
function statusVariant(s: TicketStatus): 'open' | 'waiting' | 'closed' {
  switch (s) {
    case 'resolved': return 'closed';
    case 'waiting':  return 'waiting';
    default:         return 'open'; // open, in_progress
  }
}
function fmtWhen(ts: string): string {
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function ClientTicketThread({ params }: { params: Promise<{ ref: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/support');
  const { ref } = await params;
  const ticket = queries.getTicketByRef(ref);
  // Ownership: only the requester can read their thread.
  if (!ticket || ticket.user_id !== user.id) notFound();
  const messages = queries.getTicketMessages(ticket.id);
  const resolved = ticket.status === 'resolved';

  return (
    <div className="space-y-6 motion-fade-in" style={{ maxWidth: '64ch', margin: '0 auto' }}>
      <div>
        <Link href="/support" style={{ fontSize: 12, color: 'var(--muted-2)' }}>← All tickets</Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className="ed-mono" style={{ letterSpacing: 0, textTransform: 'none', color: 'var(--muted-2)' }}>{ticket.ref}</span>
        <span className={`ed-chip status-${statusVariant(ticket.status)}`}>{STATUS_LABEL[ticket.status]}</span>
      </div>
      <FcPageHead title={ticket.subject} />

      <div className="space-y-3">
        {messages.map(m => {
          const fromUs = m.author === 'operator';
          return (
            <div
              key={m.id}
              className="ed-subpanel"
              style={fromUs ? { marginLeft: 0, borderColor: 'var(--accent)' } : { marginLeft: 24 }}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span style={{ fontSize: 11, fontWeight: 600, color: fromUs ? 'var(--accent)' : 'var(--muted)' }}>
                  {fromUs ? 'FlyCheap Support' : 'You'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{fmtWhen(m.created_at)}</span>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.body}</div>
            </div>
          );
        })}
      </div>

      <div className="ed-panel">
        {resolved ? (
          <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>
            This ticket is resolved. If it&apos;s still not right, reply below and it&apos;ll reopen for us.
          </p>
        ) : (
          <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 12 }}>Add to the conversation — we&apos;ll get an email and get back to you.</p>
        )}
        <form action={clientReply} className="space-y-3 mt-3">
          <input type="hidden" name="ref" value={ticket.ref} />
          <textarea
            name="body" required rows={4}
            placeholder="Type your reply…"
            className="ed-input"
            style={{ resize: 'vertical' }}
          />
          <div className="flex justify-end">
            <button type="submit" className="ed-btn ed-btn-primary">{resolved ? 'Reopen with a reply' : 'Send reply'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { queries, type TicketStatus } from '@/lib/db';
import { openTicket } from './actions';
import { FcPageHead } from '@/components/fc/PageKit';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Support — FlyCheap',
  description: 'Open a support ticket and track our reply, all in one place.',
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open', in_progress: 'In progress', waiting: 'Waiting on you', resolved: 'Resolved',
};
/** Four backend statuses fold into the three chip variants editorial.css
 *  defines: still-with-us (open/in_progress) reads as the accent "open"
 *  chip, waiting-on-you keeps its own amber chip, and resolved reads as
 *  the muted "closed" chip. */
function statusVariant(s: TicketStatus): 'open' | 'waiting' | 'closed' {
  switch (s) {
    case 'resolved': return 'closed';
    case 'waiting':  return 'waiting';
    default:         return 'open'; // open, in_progress
  }
}
function ago(ts: string | null): string {
  if (!ts) return '';
  const then = new Date(ts.replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/support');
  const { error } = await searchParams;
  const tickets = queries.listUserTickets(user.id, 50);

  return (
    <div className="space-y-6" style={{ maxWidth: '64ch', margin: '0 auto' }}>
      <div className="ed-eyebrow">Support</div>
      <FcPageHead
        title="Something not working? Tell us."
        lede="Open a ticket and we'll fix it fast. You'll get an email the moment we reply — and every ticket stays here so you can follow the whole thread."
      />

      <section className="ed-panel">
        <h2 className="ed-h2">Open a ticket</h2>
        {error === 'limit' && (
          <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>
            You&apos;ve opened a lot of tickets today. Reply on an existing one, or try again tomorrow.
          </p>
        )}
        <form action={openTicket} className="space-y-3">
          <div>
            <label htmlFor="t-subject" className="ed-label">Subject</label>
            <input
              id="t-subject" name="subject" maxLength={120}
              placeholder="e.g. My fare alerts stopped arriving"
              className="ed-input"
            />
          </div>
          <div>
            <label htmlFor="t-message" className="ed-label">What&apos;s happening?</label>
            <textarea
              id="t-message" name="message" required rows={5}
              placeholder="Tell us what you expected, what happened instead, and the page or route it affects. Screenshots help — paste them in."
              className="ed-input"
              style={{ resize: 'vertical' }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>Replies go to {user.email}</span>
            <button type="submit" className="ed-btn ed-btn-primary">Send ticket</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="ed-h2" style={{ marginBottom: 14 }}>Your tickets</h2>
        {tickets.length === 0 ? (
          <div className="ed-panel" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>No tickets yet. When you open one, it&apos;ll show up here with our replies.</p>
          </div>
        ) : (
          <div className="ed-ranked">
            {tickets.map(t => (
              <Link
                key={t.id}
                href={`/support/${t.ref}`}
                className="ed-ranked-row"
                style={{ gridTemplateColumns: '1fr auto', textDecoration: 'none', color: 'inherit' }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="ed-mono" style={{ letterSpacing: 0, textTransform: 'none', color: 'var(--muted-2)' }}>{t.ref}</span>
                    <span className={`ed-chip status-${statusVariant(t.status)}`}>{STATUS_LABEL[t.status]}</span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginTop: 4 }}>{t.subject}</div>
                </div>
                <div style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>
                  <div>{t.message_count} msg{t.message_count === 1 ? '' : 's'}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>{ago(t.last_reply_at || t.updated_at)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="ed-actions" style={{ justifyContent: 'center' }}>
        <Link href="/" className="ed-btn ed-btn-secondary">← Back to dashboard</Link>
        <Link href="/status" className="ed-btn ed-btn-secondary">System status</Link>
      </div>
    </div>
  );
}

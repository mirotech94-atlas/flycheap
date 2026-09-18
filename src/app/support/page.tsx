import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { queries, type TicketStatus } from '@/lib/db';
import { openTicket } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Support — FlyCheap',
  description: 'Open a support ticket and track our reply, all in one place.',
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open', in_progress: 'In progress', waiting: 'Waiting on you', resolved: 'Resolved',
};
function statusClasses(s: TicketStatus): string {
  switch (s) {
    case 'resolved':    return 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20';
    case 'waiting':     return 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/20';
    case 'in_progress': return 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-500/10 dark:border-sky-500/20';
    default:            return 'text-[#8a6d1a] bg-[#faf3dc] border-[#e6d9a8] dark:text-[#f0d674] dark:bg-[#d4af37]/10 dark:border-[#d4af37]/25';
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
    <div className="space-y-6 motion-fade-in max-w-3xl mx-auto">
      <div>
        <div className="eyebrow mb-1">Support</div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight font-display">
          Something not working? Tell us.
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Open a ticket and we&apos;ll fix it fast. You&apos;ll get an email the moment we reply — and every ticket stays here so you can follow the whole thread.
        </p>
      </div>

      <div className="card">
        <h2 className="!mb-3 text-base">Open a ticket</h2>
        {error === 'short' && <p className="text-sm text-rose-600 mb-3">Please describe the problem in a little more detail (at least 10 characters).</p>}
        {error === 'limit' && <p className="text-sm text-rose-600 mb-3">You&apos;ve opened a lot of tickets today. Reply on an existing one, or try again tomorrow.</p>}
        <form action={openTicket} className="space-y-3">
          <div>
            <label htmlFor="t-subject" className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
            <input
              id="t-subject" name="subject" maxLength={120}
              placeholder="e.g. My fare alerts stopped arriving"
              className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
            />
          </div>
          <div>
            <label htmlFor="t-message" className="block text-xs font-medium text-slate-500 mb-1">What&apos;s happening?</label>
            <textarea
              id="t-message" name="message" required rows={5}
              placeholder="Tell us what you expected, what happened instead, and the page or route it affects. Screenshots help — paste them in."
              className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3.5 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40 resize-y"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">Replies go to {user.email}</span>
            <button type="submit" className="btn btn-primary">Send ticket</button>
          </div>
        </form>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">Your tickets</h2>
        {tickets.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-sm text-slate-500">No tickets yet. When you open one, it&apos;ll show up here with our replies.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tickets.map(t => (
              <Link
                key={t.id}
                href={`/support/${t.ref}`}
                className="card flex items-center justify-between gap-4 hover:border-[#d4af37]/40 transition"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-400">{t.ref}</span>
                    <span className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded-full border ${statusClasses(t.status)}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white truncate mt-1">{t.subject}</div>
                </div>
                <div className="text-xs text-slate-400 shrink-0 text-right">
                  <div>{t.message_count} msg{t.message_count === 1 ? '' : 's'}</div>
                  <div className="mt-0.5">{ago(t.last_reply_at || t.updated_at)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 pt-2 justify-center">
        <Link href="/" className="btn">← Back to dashboard</Link>
        <Link href="/status" className="btn">System status</Link>
      </div>
    </div>
  );
}

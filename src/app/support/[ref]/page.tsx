import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { queries, type TicketStatus } from '@/lib/db';
import { clientReply } from '../actions';

export const dynamic = 'force-dynamic';

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
    <div className="space-y-6 motion-fade-in max-w-2xl mx-auto">
      <div>
        <Link href="/support" className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white/80 transition">← All tickets</Link>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] text-slate-400">{ticket.ref}</span>
            <span className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded-full border ${statusClasses(ticket.status)}`}>
              {STATUS_LABEL[ticket.status]}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight font-display">{ticket.subject}</h1>
        </div>
      </div>

      <div className="space-y-3">
        {messages.map(m => {
          const fromUs = m.author === 'operator';
          return (
            <div
              key={m.id}
              className={`rounded-xl border p-4 ${
                fromUs
                  ? 'border-[#d4af37]/30 bg-[#faf7ef] dark:bg-[#d4af37]/[0.07] dark:border-[#d4af37]/25'
                  : 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02] ml-6'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className={`text-[11px] font-semibold ${fromUs ? 'text-[#8a6d1a] dark:text-[#f0d674]' : 'text-slate-500'}`}>
                  {fromUs ? 'FlyCheap Support' : 'You'}
                </span>
                <span className="text-[11px] text-slate-400">{fmtWhen(m.created_at)}</span>
              </div>
              <div className="text-sm text-slate-800 dark:text-white/85 leading-relaxed whitespace-pre-wrap">{m.body}</div>
            </div>
          );
        })}
      </div>

      <div className="card">
        {resolved ? (
          <p className="text-sm text-slate-500">
            This ticket is resolved. If it&apos;s still not right, reply below and it&apos;ll reopen for us.
          </p>
        ) : (
          <p className="text-sm text-slate-500 mb-3">Add to the conversation — we&apos;ll get an email and get back to you.</p>
        )}
        <form action={clientReply} className="space-y-3 mt-3">
          <input type="hidden" name="ref" value={ticket.ref} />
          <textarea
            name="body" required rows={4}
            placeholder="Type your reply…"
            className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3.5 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40 resize-y"
          />
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary">{resolved ? 'Reopen with a reply' : 'Send reply'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

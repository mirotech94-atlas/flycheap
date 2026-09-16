import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';
import { fmtRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ErrorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin/errors');
  const allowList = (process.env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const isAdmin = user.id === 1 || allowList.includes(user.email.toLowerCase());
  if (!isAdmin) redirect('/');

  const errs = queries.recentErrors(200);
  // Resolve user_id -> a human label (email/username); system events stay 'system'.
  const userLabel = new Map<number, string>();
  for (const uid of Array.from(new Set(errs.map(e => e.user_id).filter((v): v is number => typeof v === 'number')))) {
    const u = queries.getUserById(uid);
    if (u) userLabel.set(uid, u.username || u.email);
  }
  const byLevel = errs.reduce<Record<string, number>>((a, e) => { a[e.level] = (a[e.level] ?? 0) + 1; return a; }, {});

  return (
    <div className="space-y-6 motion-fade-in">
      <div>
        <div className="eyebrow mb-1">Admin · debug</div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight font-display">
          Error log
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Last {errs.length} server-side events. {byLevel.error || 0} errors · {byLevel.warn || 0} warnings · {byLevel.info || 0} info.
        </p>
      </div>

      {errs.length === 0 ? (
        <div className="card text-center py-12 text-slate-500 text-sm">🎉 No errors logged. Either everything is healthy or nothing is being logged yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="fmt">
            <thead>
              <tr>
                <th>When</th>
                <th>Level</th>
                <th>Source</th>
                <th>Message</th>
                <th>User</th>
                <th>Context</th>
              </tr>
            </thead>
            <tbody>
              {errs.map(e => (
                <tr key={e.id} className={e.level === 'error' ? 'row-hot' : ''}>
                  <td className="text-slate-500 text-xs whitespace-nowrap">{fmtRelative(e.occurred_at + 'Z')}</td>
                  <td>
                    <span className={`badge ${e.level === 'error' ? 'badge-warn' : e.level === 'warn' ? 'badge-gold' : 'badge-muted'}`}>
                      {e.level}
                    </span>
                  </td>
                  <td className="text-xs font-mono text-slate-600 dark:text-slate-300">{e.source ?? '—'}</td>
                  <td className="text-xs">
                    <div className="font-semibold text-slate-900 dark:text-white">{e.message.slice(0, 120)}</div>
                    {e.stack && (
                      <details className="mt-1">
                        <summary className="text-[10px] text-slate-400 cursor-pointer">stack</summary>
                        <pre className="text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded p-2 mt-1 overflow-x-auto whitespace-pre-wrap">{e.stack.slice(0, 1200)}</pre>
                      </details>
                    )}
                  </td>
                  <td className="text-xs text-slate-500">{e.user_id == null
                    ? <span className="text-slate-400 italic">system</span>
                    : (userLabel.get(e.user_id) ?? `user #${e.user_id}`)}</td>
                  <td className="text-[10px] font-mono text-slate-500 max-w-xs truncate" title={e.context ?? ''}>{e.context ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

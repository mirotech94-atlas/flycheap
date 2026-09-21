import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';
import { fmtRelative } from '@/lib/utils';
import { PageHead, Panel, Status, Table, type Tone } from '../_components/ui';
import { StackedBars } from '../_components/StackedBars';

export const dynamic = 'force-dynamic';

const LEVEL_TONE: Record<string, Tone> = { error: 'bad', warn: 'warn', info: 'neutral' };

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

  // Daily volume, bucketed from the events this page already loaded (no new
  // query). `recentErrors(200)` is a row LIMIT, not a date range, so the
  // oldest day in the window is almost always a partial day — kept in, it
  // renders as a fake dip. Drop it rather than imply a complete calendar range.
  const byDay = new Map<string, number>();
  for (const e of errs) {
    const day = e.occurred_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const days = Array.from(byDay.keys()).sort();
  const dailySeries = (days.length > 1 ? days.slice(1) : days)
    .map(day => ({ a: byDay.get(day) ?? 0, label: day.slice(5) }));

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Admin · debug"
        title="Error log"
        sub={`Last ${errs.length} server-side events. ${byLevel.error || 0} errors · ${byLevel.warn || 0} warnings · ${byLevel.info || 0} info.`}
      />

      {dailySeries.length > 1 && (
        <Panel title="Daily volume" sub="All log levels, bucketed from the window below — not a complete calendar range">
          <StackedBars series={dailySeries} />
        </Panel>
      )}

      <Panel title="Recent events">
        {errs.length === 0 ? (
          <div className="ad-note py-6 text-center">🎉 No errors logged. Either everything is healthy or nothing is being logged yet.</div>
        ) : (
          <Table head={['When', 'Level', 'Source', 'Message', 'User', 'Context']}>
            {errs.map(e => (
              <tr key={e.id} className={e.level === 'error' ? 'row-hot' : ''}>
                <td className="ad-note whitespace-nowrap">{fmtRelative(e.occurred_at + 'Z')}</td>
                <td><Status tone={LEVEL_TONE[e.level] ?? 'neutral'}>{e.level}</Status></td>
                <td className="font-mono text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>{e.source ?? '—'}</td>
                <td className="text-[12.5px]">
                  <div className="font-medium" style={{ color: 'var(--ink)' }}>{e.message.slice(0, 120)}</div>
                  {e.stack && (
                    <details className="mt-1">
                      <summary className="ad-note cursor-pointer">stack</summary>
                      <pre className="ed-code mt-1 overflow-x-auto whitespace-pre-wrap" style={{ display: 'block' }}>{e.stack.slice(0, 1200)}</pre>
                    </details>
                  )}
                </td>
                <td className="ad-note">{e.user_id == null
                  ? <span className="italic">system</span>
                  : (userLabel.get(e.user_id) ?? `user #${e.user_id}`)}</td>
                <td className="font-mono text-[10.5px] max-w-xs truncate" style={{ color: 'var(--muted-2)' }} title={e.context ?? ''}>{e.context ?? ''}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

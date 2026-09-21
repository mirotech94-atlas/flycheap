import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { orgsForUser } from '@/lib/org';
import { queries } from '@/lib/db';
import { parseSummary } from '@/lib/reportQueue';
import { FcPageHead, FcPanel, FcEmpty, FcMoney } from '@/components/fc/PageKit';
import { approveReport, approveSelected, approveAllQueued, skipReport } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Monthly reports — FlyCheap' };

/**
 * Review, then send.
 *
 * Every report on this page is one the scheduler built and nobody has read.
 * It is shown IN FULL — every line, every loss, every trip it could not score
 * and why — because that is what the client will see, and the agency gets the
 * last look. Approve one, approve the ones you ticked, or approve all of them;
 * the send happens within minutes of approval and never before.
 */
export default async function OrgReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Forg%2Freports');

  const orgs = orgsForUser(user.id);
  if (orgs.length === 0) redirect('/org');
  const org = orgs[0];
  const canApprove = org.role === 'owner' || org.role === 'admin';

  const queued = queries.reportSendsForOrg(org.id, 'queued');
  const recent = queries.reportSendsForOrg(org.id).filter(r => r.status !== 'queued').slice(0, 12);
  const counts = queries.reportSendCounts(org.id);

  return (
    <div>
      <FcPageHead
        title="Monthly reports"
        lede={`${org.name} · ${counts.queued} awaiting review · ${counts.approved} approved, sending · ${counts.sent} sent`}
        action={<Link href="/org" className="ed-btn ed-btn-secondary">Today</Link>}
      />

      {queued.length === 0 ? (
        <FcPanel title="Awaiting your review">
          <FcEmpty
            headline="Nothing to review"
            body="Reports are built on the first of each month, one per client group that had a trip to report on. They appear here and go nowhere until someone approves them."
          />
        </FcPanel>
      ) : (
        <form action={approveSelected}>
          <input type="hidden" name="orgId" value={org.id} />
          <FcPanel
            title="Awaiting your review"
            note="What you see here is exactly what the client receives. Losses and unscored trips are included on purpose."
            action={canApprove ? (
              <div className="flex items-center gap-2">
                <button type="submit" className="ed-btn ed-btn-secondary">Approve selected</button>
                <button type="submit" formAction={approveAllQueued} className="ed-btn ed-btn-primary">
                  Approve all {queued.length}
                </button>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>Only an owner or admin can approve</span>
            )}
          >
            <ul className="ed-queue">
              {queued.map(r => {
                const s = parseSummary(r);
                const scored = s.lines.length;
                const total = scored + s.unscored.length;
                return (
                  <li key={r.id} className="ed-queue-row act">
                    <div className="ed-queue-main">
                      <div className="flex items-start gap-3">
                        {canApprove && (
                          <input type="checkbox" name="ids" value={r.id} className="mt-1" aria-label={`Select ${r.group_name}`} />
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="ed-queue-tag">{s.period.label}</span>
                          <span className="ed-queue-route">
                            {r.group_name}
                            <span className="ed-queue-group">
                              {' · '}{r.to_email ? `to ${r.to_email}` : 'no contact email on this group — will be skipped'}
                            </span>
                          </span>
                          <div className="ed-savings-total mt-2">
                            <span className="ed-savings-label">Total saved</span>
                            <span className={s.totalSavedUsd >= 0 ? 'ed-savings-amount' : 'ed-savings-amount ed-delta-down'}>
                              <FcMoney usd={s.totalSavedUsd} />
                            </span>
                            <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>
                              {scored} of {total} trip{total === 1 ? '' : 's'} scored
                            </span>
                          </div>
                          {scored > 0 && (
                            <table className="ed-table">
                              <thead><tr><th>Route</th><th>Baseline</th><th>Paid</th><th>Saved</th></tr></thead>
                              <tbody>
                                {s.lines.map(l => (
                                  <tr key={l.watchId}>
                                    <td style={{ fontFamily: 'var(--font-mono-ed)' }}>{l.route}</td>
                                    <td><FcMoney usd={l.baselineUsd} muted /></td>
                                    <td><FcMoney usd={l.bookedUsd} muted /></td>
                                    <td className={l.savedUsd >= 0 ? '' : 'ed-delta-down'}>
                                      <FcMoney usd={l.savedUsd} /> ({l.savedPct.toFixed(0)}%)
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {s.unscored.length > 0 && (
                            <p className="ed-panel-note">
                              Not counted: {s.unscored.map(u => `${u.route} (${u.reason})`).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    {canApprove && (
                      <div className="ed-queue-actions">
                        {/* The row id is BOUND into the action, not a name/value
                            on the button: React stores its own
                            name="$ACTION_ID_…" on a button that carries a
                            server-action formAction, so a name="id" there is
                            overwritten — the page hydrates with a mismatch and
                            the action reads id as null. .bind() is the
                            supported way to pass a per-row argument. */}
                        <button type="submit" formAction={approveReport.bind(null, r.id)} className="ed-btn ed-btn-secondary">
                          Approve
                        </button>
                        <button type="submit" formAction={skipReport.bind(null, r.id)} className="ed-btn ed-btn-quiet">
                          Skip
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </FcPanel>
        </form>
      )}

      {recent.length > 0 && (
        <FcPanel title="Recent" note="Approved reports send within about fifteen minutes.">
          <table className="ed-table">
            <thead><tr><th>Period</th><th>Group</th><th>Status</th><th>To</th></tr></thead>
            <tbody>
              {recent.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--font-mono-ed)' }}>{r.period_start.slice(0, 7)}</td>
                  <td>{r.group_name}</td>
                  <td>
                    <span className={r.status === 'sent' ? 'ed-chip status-ok' : 'ed-chip status-closed'}>
                      {r.status}{r.skip_reason ? ` · ${r.skip_reason}` : ''}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted-2)' }}>{r.to_email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </FcPanel>
      )}
    </div>
  );
}

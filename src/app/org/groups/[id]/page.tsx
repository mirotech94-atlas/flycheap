import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getGroup, roleInOrg, getOrg, limitsForOrg } from '@/lib/org';
import { boardsForGroup } from '@/lib/boardShare';
import { loadGroupSavings } from '@/lib/orgQueue';
import { queries } from '@/lib/db';
import { FcPageHead, FcPanel, FcEmpty, FcMoney } from '@/components/fc/PageKit';
import { markBooked, unmarkBooked, adjustTarget, revokeGroupBoard, rotateGroupBoard } from '../../actions';

export const dynamic = 'force-dynamic';

// The root layout titles everything "Executive Dashboard". This page carries a
// client's name and travel plans, so it gets its own title and is never indexed.
export const metadata = {
  title: 'Client — FlyCheap',
  robots: { index: false, follow: false },
};

function monthBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default async function GroupDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = Number(id);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=%2Forg%2Fgroups%2F${groupId}`);

  const group = getGroup(groupId);
  if (!group) notFound();
  // Membership is checked on READ too, not only on write. Travel plans for named
  // individuals are personal data; an org id in a URL is user input.
  const role = roleInOrg(group.org_id, user.id);
  if (!role) notFound();

  const org = getOrg(group.org_id);
  const limits = limitsForOrg(org);
  const canEdit = role !== 'viewer';
  const watches = queries.watchesForGroup(groupId) as Array<Record<string, unknown>>;
  const boards = boardsForGroup(groupId);
  const { start, end } = monthBounds();
  const savings = loadGroupSavings(groupId, start, end);

  return (
    <div>
      <FcPageHead
        title={group.name}
        lede={`${org?.name ?? ''}${group.contact_email ? ` · ${group.contact_email}` : ''}`}
        action={<Link href="/org" className="nc-btn-quiet">Back to today</Link>}
      />

      <FcPanel title="Watches" note="Mark booked here — it is what the savings report counts">
        {watches.length === 0 ? (
          <FcEmpty headline="No watches yet" body="Add a route for this client and it will appear here." />
        ) : (
          <table className="nc-table">
            <thead>
              <tr>
                <th>Route</th><th>Departs</th><th>Baseline</th><th>Target</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {watches.map(w => {
                const wid = Number(w.id);
                const booked = String(w.status ?? '') === 'booked';
                return (
                  <tr key={wid} id={`w${wid}`}>
                    <td className="nc-mono">{String(w.origin)} → {String(w.destination)}</td>
                    <td>{String(w.depart_date ?? '—')}</td>
                    <td>
                      {/* Stated, never silently recomputed. */}
                      <FcMoney usd={w.baseline_amount_usd as number | null} muted />
                    </td>
                    <td><FcMoney usd={(w.target_amount ?? w.target_per_adult_usd) as number | null} muted /></td>
                    <td>
                      {booked
                        ? <span className="nc-pill-good">booked <FcMoney usd={w.booked_amount_usd as number | null} /></span>
                        : <span className="nc-pill-quiet">{String(w.status ?? 'active')}</span>}
                    </td>
                    <td className="nc-row-actions">
                      {canEdit && !booked && (
                        <form action={markBooked} className="nc-inline-form">
                          <input type="hidden" name="groupId" value={groupId} />
                          <input type="hidden" name="watchId" value={wid} />
                          <input name="amount" type="number" step="1" min="1" required
                                 placeholder="paid" aria-label="Amount paid" className="nc-input-sm" />
                          <button type="submit" className="nc-btn nc-btn-sm">Mark booked</button>
                        </form>
                      )}
                      {canEdit && booked && (
                        <form action={unmarkBooked} className="nc-inline-form">
                          <input type="hidden" name="groupId" value={groupId} />
                          <input type="hidden" name="watchId" value={wid} />
                          <button type="submit" className="nc-btn-quiet nc-btn-sm">Undo</button>
                        </form>
                      )}
                      {canEdit && (
                        <form action={adjustTarget} className="nc-inline-form">
                          <input type="hidden" name="groupId" value={groupId} />
                          <input type="hidden" name="watchId" value={wid} />
                          <input name="amount" type="number" step="1" min="1" required
                                 placeholder="target" aria-label="New target" className="nc-input-sm" />
                          <button type="submit" className="nc-btn-quiet nc-btn-sm">Set target</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </FcPanel>

      <FcPanel title="Savings this month" note={`${start} to ${end} · baseline is the fare when the trip was requested`}>
        {savings.lines.length === 0 && savings.unscored.length === 0 ? (
          <FcEmpty headline="Nothing to report yet" body="Savings appear once a watch has a baseline and a booking recorded against it." />
        ) : (
          <>
            <div className="nc-savings-total">
              <span className="nc-savings-label">Total saved</span>
              <span className={savings.totalSavedUsd >= 0 ? 'nc-savings-amount' : 'nc-savings-amount nc-neg'}>
                <FcMoney usd={savings.totalSavedUsd} />
              </span>
            </div>
            {savings.lines.length > 0 && (
              <table className="nc-table">
                <thead><tr><th>Route</th><th>Baseline</th><th>Paid</th><th>Saved</th></tr></thead>
                <tbody>
                  {savings.lines.map(l => (
                    <tr key={l.watchId}>
                      <td className="nc-mono">{l.route}</td>
                      <td><FcMoney usd={l.baselineUsd} muted /></td>
                      <td><FcMoney usd={l.bookedUsd} muted /></td>
                      <td className={l.savedUsd >= 0 ? '' : 'nc-neg'}>
                        <FcMoney usd={l.savedUsd} /> ({l.savedPct.toFixed(0)}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {savings.unscored.length > 0 && (
              /* Listed, never dropped. A total that quietly omits the trips it
                 could not score stops being believed the first time a client
                 notices one missing. */
              <p className="nc-note">
                Not counted: {savings.unscored.map(u => `${u.route} (${u.reason})`).join(' · ')}
              </p>
            )}
          </>
        )}
      </FcPanel>

      <FcPanel
        title="Client board"
        note={limits.brandedBoards ? 'Branded, on your domain' : 'Read-only link · branding is an Enterprise feature'}
      >
        {boards.filter(b => !b.revoked_at).length === 0 ? (
          <FcEmpty headline="No board yet" body="A board is a read-only page showing this group's watches. No login, no settings, nothing else exposed." />
        ) : (
          <table className="nc-table">
            <thead><tr><th>Created</th><th>Expires</th><th>Views</th><th>Last seen</th><th></th></tr></thead>
            <tbody>
              {boards.filter(b => !b.revoked_at).map(b => (
                <tr key={b.id}>
                  <td>{b.created_at.slice(0, 10)}</td>
                  <td>{b.expires_at ? b.expires_at.slice(0, 10) : 'never'}</td>
                  {/* "Knowing the client checked the board twice this week tells
                      them the relationship is alive." */}
                  <td className="nc-mono">{b.view_count}</td>
                  <td>{b.last_viewed_at ? b.last_viewed_at.slice(0, 16) : '—'}</td>
                  <td className="nc-row-actions">
                    {canEdit && (
                      <>
                        <form action={rotateGroupBoard} className="nc-inline-form">
                          <input type="hidden" name="groupId" value={groupId} />
                          <input type="hidden" name="boardId" value={b.id} />
                          <button type="submit" className="nc-btn-quiet nc-btn-sm">Rotate link</button>
                        </form>
                        <form action={revokeGroupBoard} className="nc-inline-form">
                          <input type="hidden" name="groupId" value={groupId} />
                          <input type="hidden" name="boardId" value={b.id} />
                          <button type="submit" className="nc-btn-quiet nc-btn-sm">Revoke</button>
                        </form>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="nc-note">
          The board link is shown once when it is created and is never stored — only a hash of it is
          kept, so a copy of our database does not hand anyone your clients&rsquo; travel plans.
          Rotating issues a new link and kills the old one in the same action.
        </p>
      </FcPanel>
    </div>
  );
}

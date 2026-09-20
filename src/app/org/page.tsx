import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { orgsForUser } from '@/lib/org';
import { loadOrgQueue } from '@/lib/orgQueue';
import { FcPageHead, FcPanel, FcEmpty } from '@/components/fc/PageKit';
import type { QueueReason } from '@/lib/workQueue';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Today — FlyCheap' };

/**
 * The org home.
 *
 * "The org home is not a list of groups, it is a work queue. What needs a human
 *  today... An agent should be able to work top-down and stop when the queue is
 *  empty."
 *
 * So this page is the queue, and nothing else is above it. No charts, no
 * totals, no welcome panel — anything placed above the first row is something
 * the agent has to scroll past every morning.
 */

const REASON_LABEL: Record<QueueReason, string> = {
  'verdict-flipped-to-buy': 'Act now',
  'departing-unbooked': 'Departing soon',
  'booking-unrecorded': 'Record what was paid',
  'target-unreachable': 'Reset expectations',
  'group-inactive': 'Quiet client',
};

/** Amber is the reading light: only the rows that want action carry it. */
const REASON_TONE: Record<QueueReason, string> = {
  'verdict-flipped-to-buy': 'nc-q-act',
  'departing-unbooked': 'nc-q-soon',
  'booking-unrecorded': 'nc-q-soon',
  'target-unreachable': 'nc-q-quiet',
  'group-inactive': 'nc-q-quiet',
};

export default async function OrgHome() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Forg');

  const orgs = orgsForUser(user.id);
  if (orgs.length === 0) {
    return (
      <div>
        <FcPageHead title="Organisation" lede="Client boards, savings reports and a shared work queue." />
        <FcPanel title="No organisation yet">
          <FcEmpty
            headline="This account is not part of an organisation"
            body="Organisations group watches by client, cohort or department, and unlock branded client boards and savings reports. Ask us to set one up."
          />
        </FcPanel>
      </div>
    );
  }

  const org = orgs[0];
  const { items, watchCount, groupCount } = loadOrgQueue(org.id);

  return (
    <div>
      <FcPageHead
        title="Today"
        lede={`${org.name} · ${groupCount} group${groupCount === 1 ? '' : 's'}, ${watchCount} watch${watchCount === 1 ? '' : 'es'}`}
        action={
          <div className="flex items-center gap-2">
            <Link href="/org/reports" className="nc-btn-quiet">Reports</Link>
            <Link href="/org/groups" className="nc-btn-quiet">Groups</Link>
          </div>
        }
      />

      {items.length === 0 ? (
        <FcPanel title="Queue">
          {/* Reaching zero is the point. A queue that can never be emptied is a
              list, and a list does not get worked. */}
          <FcEmpty
            headline="Nothing needs you today"
            body="No verdicts have flipped, nothing is departing unbooked, and every client has had activity this month. This page fills itself when something changes."
          />
        </FcPanel>
      ) : (
        <FcPanel title="Queue" note="Work top-down and stop when it is empty">
          <ul className="nc-queue">
            {items.map((it, i) => (
              <li key={`${it.reason}-${it.watchId ?? 'g'}-${i}`} className={`nc-queue-row ${REASON_TONE[it.reason]}`}>
                <div className="nc-queue-main">
                  <span className="nc-queue-tag">{REASON_LABEL[it.reason]}</span>
                  <span className="nc-queue-route">
                    {it.route ?? it.groupName}
                    {it.route && <span className="nc-queue-group"> · {it.groupName}</span>}
                  </span>
                  <p className="nc-queue-detail">{it.detail}</p>
                </div>
                <div className="nc-queue-actions">
                  {/* Three actions inline, no navigation — an agent who has to
                      open a page to act will not act. */}
                  {it.watchId != null && (
                    <>
                      <Link href={`/org/groups/${it.groupId}#w${it.watchId}`} className="nc-btn-quiet nc-btn-sm">
                        Adjust target
                      </Link>
                      <Link href={`/org/groups/${it.groupId}#w${it.watchId}`} className="nc-btn nc-btn-sm">
                        Mark booked
                      </Link>
                    </>
                  )}
                  {it.watchId == null && (
                    <Link href={`/org/groups/${it.groupId}`} className="nc-btn-quiet nc-btn-sm">Open client</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </FcPanel>
      )}
    </div>
  );
}

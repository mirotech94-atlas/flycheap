import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { orgsForUser, groupsForOrg, limitsForOrg } from '@/lib/org';
import { queries } from '@/lib/db';
import { FcPageHead, FcPanel, FcEmpty } from '@/components/fc/PageKit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Groups — FlyCheap' };

export default async function GroupsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Forg%2Fgroups');
  const orgs = orgsForUser(user.id);
  if (orgs.length === 0) redirect('/org');

  const org = orgs[0];
  const groups = groupsForOrg(org.id);
  const limits = limitsForOrg(org);

  return (
    <div>
      <FcPageHead
        title="Groups"
        lede={`${groups.length} of ${limits.groups === Infinity ? 'unlimited' : limits.groups} · a group is a client, a cohort, a department or a wedding`}
        action={<Link href="/org" className="nc-btn-quiet">Back to today</Link>}
      />
      <FcPanel title={org.name}>
        {groups.length === 0 ? (
          <FcEmpty
            headline="No groups yet"
            body="Groups are how watches are organised for clients. Bulk import accepts a CSV of group name, contact email, origin, destination, date window and target."
          />
        ) : (
          <table className="nc-table">
            <thead><tr><th>Group</th><th>Contact</th><th>Watches</th><th>Booked</th></tr></thead>
            <tbody>
              {groups.map(g => {
                const watches = queries.watchesForGroup(g.id) as Array<Record<string, unknown>>;
                const booked = watches.filter(w => String(w.status ?? '') === 'booked').length;
                return (
                  <tr key={g.id}>
                    <td><Link href={`/org/groups/${g.id}`} className="nc-link">{g.name}</Link></td>
                    <td className="nc-muted">{g.contact_email ?? '—'}</td>
                    <td className="nc-mono">{watches.length}</td>
                    <td className="nc-mono">{booked}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </FcPanel>
    </div>
  );
}

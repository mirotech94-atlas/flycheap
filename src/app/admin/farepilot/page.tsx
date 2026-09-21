import { redirect } from 'next/navigation';
import { getCurrentUser, isOwner, isAdminHost } from '@/lib/auth';
import { headers } from 'next/headers';
import { queries } from '@/lib/db';
import { AdminFarePilot } from '@/components/AdminFarePilot';
import { fmtRelative } from '@/lib/utils';
import { Panel } from '../_components/ui';

export const dynamic = 'force-dynamic';

export default async function FarePilotAdminPage() {
  const h = await headers();
  if (!isAdminHost(h.get('x-forwarded-host') ?? h.get('host'))) redirect('https://flycheap.live/');
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin/farepilot');
  // OWNER ONLY — this console can run arbitrary SQL + shell on production.
  if (!isOwner(user)) redirect('/');

  const audit = queries.recentAdminAgentAudit(15);
  const totpEnabled = (user.totp_enabled === 1 && !!user.totp_secret) || !!process.env.OWNER_TOTP_SECRET;

  return (
    <div className="space-y-6 motion-fade-in">
      <div>
        <div className="ad-eyebrow accent mb-1">Admin · operator console</div>
        <h1 className="ed-h1">
          FarePilot Admin
        </h1>
        <p className="ed-sub">
          Owner-only. Full read / write / execute over the app and any client. Runs as <code className="ed-code">egyflights</code> on production. Every action is logged below.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <AdminFarePilot totpEnabled={totpEnabled} />

        <Panel title="Recent actions">
          {audit.length === 0 ? (
            <p className="text-xs ad-note">No actions yet.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {audit.map(a => (
                <li key={a.id} className="ad-rule-top pb-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className={`font-mono ${a.ok ? 'ad-tone-neutral' : 'ad-tone-bad'}`}>{a.tool}</span>
                    <span className="ad-note">{fmtRelative(a.created_at + 'Z')}</span>
                  </div>
                  {a.input && <div className="mt-0.5 truncate font-mono text-[10px] ad-note" title={a.input}>{a.input}</div>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

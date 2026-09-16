import { redirect } from 'next/navigation';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { queries } from '@/lib/db';
import { AdminFarePilot } from '@/components/AdminFarePilot';
import { fmtRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function FarePilotAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin/farepilot');
  // OWNER ONLY — this console can run arbitrary SQL + shell on production.
  if (!isOwner(user)) redirect('/');

  const audit = queries.recentAdminAgentAudit(15);
  const totpEnabled = user.totp_enabled === 1 && !!user.totp_secret;

  return (
    <div className="space-y-6 motion-fade-in">
      <div>
        <div className="eyebrow mb-1">Admin · operator console</div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight font-display">
          FarePilot Admin
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Owner-only. Full read / write / execute over the app and any client. Runs as <code className="text-xs">egyflights</code> on production. Every action is logged below.
        </p>
        {!totpEnabled && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            Two-factor authentication is not enabled on your account. Read-only questions work, but running SQL or shell needs an authenticator code — enable 2FA on your account to unlock those.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <AdminFarePilot totpEnabled={totpEnabled} />

        <div className="card">
          <div className="eyebrow mb-2">Recent actions</div>
          {audit.length === 0 ? (
            <p className="text-xs text-slate-400">No actions yet.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {audit.map(a => (
                <li key={a.id} className="border-b border-slate-100 pb-2 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className={`font-mono ${a.ok ? 'text-slate-700 dark:text-slate-200' : 'text-red-500'}`}>{a.tool}</span>
                    <span className="text-slate-400">{fmtRelative(a.created_at + 'Z')}</span>
                  </div>
                  {a.input && <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400" title={a.input}>{a.input}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

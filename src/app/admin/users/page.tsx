import Link from 'next/link';
import { queries } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { fmtRelative } from '@/lib/utils';
import { RowMenu } from './RowMenu';

export const dynamic = 'force-dynamic';

export default async function UsersPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; tier?: string }> }) {
  const params = await searchParams;
  const me = await getCurrentUser();
  const q = (params.q ?? '').trim().toLowerCase();
  const tierFilter = params.tier ?? '';

  const all = queries.listAllUsers();
  const filtered = all.filter(u => {
    if (q && !u.email.toLowerCase().includes(q) && !(u.name ?? '').toLowerCase().includes(q)) return false;
    if (tierFilter && u.tier !== tierFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#d4af37] mb-1">Admin · users</div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-white/55 mt-1">{all.length} total · {filtered.length} matching.</p>
      </div>

      <form className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search email or name…"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-md border border-white/10 bg-white/5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#d4af37]/50"
        />
        <select
          name="tier"
          defaultValue={tierFilter}
          className="px-3 py-2 rounded-md border border-white/10 bg-white/5 text-sm text-white"
        >
          <option value="">All tiers</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-[#d4af37] text-[#0a1426] text-sm font-semibold hover:bg-[#f0d674] transition"
        >
          Filter
        </button>
      </form>

      <div className="rounded-xl border border-white/6 bg-[#0f1f3a] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/45 border-b border-white/5">
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Routes</th>
              <th className="px-4 py-2 text-right">Live sessions</th>
              <th className="px-4 py-2">Last seen</th>
              <th className="px-4 py-2">Joined</th>
              <th className="px-4 py-2 w-10"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-white/50 text-sm">No users match.</td></tr>
            )}
            {filtered.map(u => (
              <tr key={u.id} className="border-t border-white/5 hover:bg-white/3">
                <td className="px-4 py-2">
                  <Link href={`/admin/users/${u.id}`} className="text-white hover:text-[#f0d674] underline underline-offset-2">
                    {u.email}
                  </Link>
                  {u.name && <div className="text-[10px] text-white/45">{u.name}</div>}
                  {u.custom_domain && <div className="text-[10px] text-[#d4af37]">{u.custom_domain}</div>}
                </td>
                <td className="px-4 py-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px] ${
                    u.tier === 'enterprise' ? 'bg-[#d4af37]/20 text-[#f0d674]' :
                    u.tier === 'pro'        ? 'bg-emerald-500/20 text-emerald-300' :
                    'bg-white/10 text-white/60'
                  }`}>{u.tier}</span>
                </td>
                <td className="px-4 py-2 text-xs text-white/55">{u.subscription_status ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{u.active_searches}/{u.total_searches}</td>
                <td className="px-4 py-2 text-right tabular-nums">{u.live_sessions}</td>
                <td className="px-4 py-2 text-xs text-white/55">{u.last_action_at ? fmtRelative(u.last_action_at + 'Z') : '—'}</td>
                <td className="px-4 py-2 text-xs text-white/55">{fmtRelative(u.created_at + 'Z')}</td>
                <td className="px-4 py-2 text-right">
                  <RowMenu
                    userId={u.id}
                    email={u.email}
                    tier={u.tier}
                    status={u.subscription_status}
                    isSelf={me?.id === u.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

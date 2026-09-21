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
        <div className="ad-eyebrow accent mb-1">Admin · users</div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="ad-note mt-1">{all.length} total · {filtered.length} matching.</p>
      </div>

      <form className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search email or name…"
            className="ed-input"
          />
        </div>
        <select
          name="tier"
          defaultValue={tierFilter}
          className="ed-input"
          style={{ width: 'auto' }}
        >
          <option value="">All tiers</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <button
          type="submit"
          className="ed-btn ed-btn-primary"
        >
          Filter
        </button>
      </form>

      <div className="ad-panel overflow-hidden" style={{ padding: 0 }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted-2)', borderBottom: '1px solid var(--rule)' }}>
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
              <tr><td colSpan={8} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>No users match.</td></tr>
            )}
            {filtered.map(u => (
              <tr key={u.id} className="hover:opacity-[0.85]" style={{ borderTop: '1px solid var(--rule-soft)' }}>
                <td className="px-4 py-2">
                  <Link href={`/admin/users/${u.id}`} className="underline underline-offset-2 hover:opacity-[0.72]" style={{ color: 'var(--ink)' }}>
                    {u.email}
                  </Link>
                  {u.name && <div className="text-[10px]" style={{ color: 'var(--muted-2)' }}>{u.name}</div>}
                  {u.custom_domain && <div className="text-[10px]" style={{ color: 'var(--accent)' }}>{u.custom_domain}</div>}
                </td>
                <td className="px-4 py-2 text-xs">
                  <TierChip tier={u.tier} />
                </td>
                <td className="px-4 py-2 text-xs" style={{ color: 'var(--muted)' }}>{u.subscription_status ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{u.active_searches}/{u.total_searches}</td>
                <td className="px-4 py-2 text-right tabular-nums">{u.live_sessions}</td>
                <td className="px-4 py-2 text-xs" style={{ color: 'var(--muted)' }}>{u.last_action_at ? fmtRelative(u.last_action_at + 'Z') : '—'}</td>
                <td className="px-4 py-2 text-xs" style={{ color: 'var(--muted)' }}>{fmtRelative(u.created_at + 'Z')}</td>
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

const TIER_TINT: Record<string, React.CSSProperties> = {
  // Bare --accent on its 8% tint measures 6.35:1 light / 6.40:1 dark — clears
  // AA as-is, no mix needed. Same map as signups/page.tsx's TierChip.
  enterprise: { background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))', color: 'var(--accent)' },
  // Fix round 1 (C1): bare --green on its 8% tint measured 4.44:1 in light —
  // under AA at this chip's 10px size. Mixed 75% toward --ink (the same move
  // .ad-tone-gold/.ad-tone-warn already make for amber) clears it: 6.21:1
  // light / 7.28:1 dark.
  pro:        { background: 'color-mix(in srgb, var(--green) 8%, var(--surface))', color: 'color-mix(in srgb, var(--green) 75%, var(--ink))' },
  // --muted on --surface-2 measures 4.18:1 in light — just under AA for this
  // size of text. --ink-soft clears it (10.35:1 light / 9.8:1 dark).
  free:       { background: 'var(--surface-2)', color: 'var(--ink-soft)' },
};

function TierChip({ tier }: { tier: string }) {
  return (
    <span className="ad-chip" style={{ textTransform: 'uppercase', ...(TIER_TINT[tier] ?? TIER_TINT.free) }}>
      {tier}
    </span>
  );
}

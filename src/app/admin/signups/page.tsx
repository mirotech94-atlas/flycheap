import { queries } from '@/lib/db';
import { fmtRelative } from '@/lib/utils';
import { listEarlyAccess } from '@/lib/early-access';
import { PageHead, Panel, Kpi, Table, fmtInt, ago } from '../_components/ui';
import { StackedBars } from '../_components/StackedBars';
import { WaitlistRow } from './WaitlistRow';

export const dynamic = 'force-dynamic';

// Single source for the "N newest signups" heading and the row limit it
// describes — was typed twice (the heading's "50" and `.slice(0, 50)`).
const NEWEST_SIGNUPS_LIMIT = 50;

export default async function SignupsPage() {
  const m = queries.adminMetrics();
  const today  = queries.signupsToday();
  const last7  = queries.signupsLastNDays(7);
  const last30 = queries.signupsLastNDays(30);
  const daily  = queries.signupsByDay(90);
  const users  = queries.listAllUsers().slice(0, NEWEST_SIGNUPS_LIMIT);
  // Early-access waitlist — the queue behind the "access request waiting" alert.
  const waitlist = (() => { try { return listEarlyAccess(); } catch { return []; } })();
  const pending = waitlist.filter(r => !r.approved_at && !r.declined_at);

  const total = m.users.total || 1;
  const free  = m.users.free;
  const pro   = m.users.pro;
  const ent   = m.users.enterprise;

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow="Admin · signups"
        title="Signups"
        sub="Acquisition + tier funnel for the FlyCheap user base."
      />

      <div id="waitlist" className="scroll-mt-24">
        <Panel
          title="Early-access waitlist"
          sub={pending.length > 0
            ? `${pending.length} request${pending.length === 1 ? '' : 's'} waiting on you — approving emails the sign-up link straight away`
            : 'Every request has been decided'}
          tone={pending.length > 0 ? 'gold' : undefined}
        >
          {waitlist.length === 0 ? (
            <div className="ad-note py-6 text-center">No access requests yet.</div>
          ) : (
            <Table head={['#', 'Email', 'Source', 'Requested', 'Decision']}>
              {waitlist.map(r => (
                <WaitlistRow
                  key={r.id}
                  id={r.id}
                  email={r.email}
                  position={r.position}
                  referredBy={r.referred_by}
                  requested={ago(r.created_at)}
                  state={r.approved_at ? 'approved' : r.declined_at ? 'declined' : 'pending'}
                />
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Today" value={fmtInt(today)} />
        <Kpi label="Last 7d" value={fmtInt(last7)} />
        <Kpi label="Last 30d" value={fmtInt(last30)} />
        <Kpi label="All-time" value={fmtInt(m.users.total)} tone="gold" />
      </div>

      <Panel title="Daily signups" sub={`Over the ${daily.length}-day window this data spans`}>
        <StackedBars series={daily.map(d => ({ a: d.n, label: d.day.slice(5) }))} />
      </Panel>

      <Panel title="Tier funnel">
        <FunnelRow label="All signups" value={total} max={total} color="accent" />
        <FunnelRow label="Free"        value={free}  max={total} color="muted" />
        <FunnelRow label="Pro"         value={pro}   max={total} color="green" />
        <FunnelRow label="Enterprise"  value={ent}   max={total} color="amber" />
      </Panel>

      <Panel title={`${NEWEST_SIGNUPS_LIMIT} newest signups`}>
        <Table head={['Email', 'Tier', 'Joined', 'Routes']}>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td><TierChip tier={u.tier} /></td>
              <td className="ad-note">{fmtRelative(u.created_at + 'Z')}</td>
              <td className="text-right tabular-nums">{u.active_searches}/{u.total_searches}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

const TIER_TINT: Record<string, React.CSSProperties> = {
  // Bare --accent on its 8% tint measures 6.35:1 light / 6.40:1 dark — clears
  // AA as-is, no mix needed.
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

/** One row of the tier funnel: label, track + fill, count and share. */
function FunnelRow({
  label, value, max, color,
}: { label: string; value: number; max: number; color: 'accent' | 'muted' | 'green' | 'amber' }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="ad-rule-top py-2">
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="truncate ad-tone-neutral">{label}</span>
        <span className="ad-note shrink-0" style={{ fontFamily: 'var(--font-mono-ed)' }}>
          {value.toLocaleString()} · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="ed-bar mt-1.5">
        <div className={`ed-bar-fill ${color === 'accent' ? '' : color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

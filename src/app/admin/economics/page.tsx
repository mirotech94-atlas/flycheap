import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin as isAdminUser } from '@/lib/auth';
import { costEarnMetrics } from '@/lib/analytics';
import { budgetState, allocatorMode } from '@/lib/pollBudget';
import { APP_URL } from '@/lib/hosts';
import {
  PageHead, SectionHead, Kpi, Panel, Status, Table, BarRow, Spark,
  fmtInt, fmtMoney, type Tone,
} from '../_components/ui';

export const dynamic = 'force-dynamic';

/**
 * Dashboard 2 — what is it costing, and what is it earning?
 *
 * The join of poll cost against commission earned is the whole business. The
 * single most useful widget is the scatter of routes with poll cost on one axis
 * and attributable revenue on the other: everything in the lower-right quadrant
 * is being polled for nothing.
 */

function usd(n: number | null, digits = 2): string {
  return n == null ? '—' : `$${n.toFixed(digits)}`;
}

/**
 * Cost-vs-revenue scatter. Inline SVG, no client JS, so it renders in the
 * server component like the rest of the admin.
 *
 * Deliberately NOT amber: amber is reserved for fares and primary actions, and
 * a chart is decoration. Teal carries every other accent.
 */
function MarginScatter({ routes }: {
  routes: Array<{ routeKey: string; origin: string; destination: string; pollCostUsd: number; commissionUsd: number }>;
}) {
  if (routes.length === 0) {
    return <p className="text-sm text-white/45">No routes have recorded poll cost in this window yet.</p>;
  }
  const W = 520, H = 280, PAD = 40;
  const maxCost = Math.max(...routes.map(r => r.pollCostUsd), 0.01);
  const maxRev = Math.max(...routes.map(r => r.commissionUsd), 0.01);
  const x = (v: number) => PAD + (v / maxCost) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / maxRev) * (H - PAD * 2);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
           aria-label="Routes plotted by poll cost against attributable revenue">
        {/* Lower-right quadrant: high cost, no revenue. The routes to throttle. */}
        <rect x={x(maxCost / 2)} y={y(maxRev / 2)} width={W - PAD - x(maxCost / 2)}
              height={H - PAD - y(maxRev / 2)} fill="#f43f5e" fillOpacity="0.07" />
        <text x={W - PAD - 6} y={H - PAD - 8} textAnchor="end"
              fontSize="10" fill="#fb7185" fillOpacity="0.8">
          polled for nothing
        </text>

        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,.18)" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="rgba(255,255,255,.18)" />
        <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.45)">
          poll cost (USD)
        </text>
        <text x={12} y={H / 2} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.45)"
              transform={`rotate(-90 12 ${H / 2})`}>
          attributable revenue (USD)
        </text>
        <text x={PAD - 6} y={PAD + 4} textAnchor="end" fontSize="9" fill="rgba(255,255,255,.4)">
          {usd(maxRev)}
        </text>
        <text x={W - PAD} y={H - PAD + 14} textAnchor="end" fontSize="9" fill="rgba(255,255,255,.4)">
          {usd(maxCost)}
        </text>

        {routes.map(r => (
          <circle
            key={r.routeKey}
            cx={x(r.pollCostUsd)} cy={y(r.commissionUsd)} r={4}
            fill={r.commissionUsd > r.pollCostUsd ? '#2dd4bf' : '#fb7185'}
            fillOpacity="0.75"
          >
            <title>
              {r.origin} → {r.destination} · cost {usd(r.pollCostUsd)} · revenue {usd(r.commissionUsd)}
            </title>
          </circle>
        ))}
      </svg>
      <p className="text-[11.5px] text-white/40 mt-2">
        Each dot is a canonical route. Teal is earning more than it costs; rose is not.
      </p>
    </div>
  );
}

export default async function EconomicsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin/economics');
  if (!isAdminUser(user)) redirect(APP_URL);

  const m = costEarnMetrics(30);
  const budget = budgetState();
  const mode = allocatorMode();

  const budgetTone: Tone =
    budget.monthlyCapUsd <= 0 ? 'neutral'
      : budget.utilisation >= 1 ? 'bad'
      : budget.utilisation >= 0.8 ? 'warn' : 'good';

  const zeroTone: Tone =
    m.zeroCommissionSharePct == null ? 'neutral'
      : m.zeroCommissionSharePct >= 50 ? 'bad'
      : m.zeroCommissionSharePct >= 25 ? 'warn' : 'good';

  const worstRoutes = m.routeMargin.slice(0, 15);

  return (
    <div>
      <PageHead
        eyebrow="Dashboard 2"
        title="What is it costing, and what is it earning?"
        sub="Per route, per user, per alert type. The join of poll cost against commission earned is the
             whole business. Last 30 days."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <Kpi
          label="Poll spend · 30 days"
          value={usd(m.totalCostUsd)}
          spark={m.spendByDay.map(d => d.costUsd)}
          foot={`${fmtInt(m.spendByProvider.reduce((s, r) => s + r.calls, 0))} provider calls`}
        />
        <Kpi
          label="Cost per tracked route"
          value={usd(m.costPerTrackedRouteUsd)}
          foot={`${fmtInt(m.trackedRoutes)} active routes. This is the dominant COGS number — it scales with users × routes × poll frequency.`}
        />
        <Kpi
          label="Cost per click-out"
          value={usd(m.costPerClickOutUsd)}
          foot={<>Cost per alert delivered: {usd(m.costPerAlertUsd)}</>}
        />
        <Kpi
          label="Zero-commission click share"
          value={m.zeroCommissionSharePct == null ? '—' : `${m.zeroCommissionSharePct.toFixed(0)}%`}
          tone={zeroTone}
          foot="Clicks going to carriers and partners that pay nothing. If this is high, the trip chain is not optional — it is the only path to revenue on those bookings."
        />
      </div>

      <SectionHead
        title="Poll budget"
        sub={`Allocator running at "${mode}" authority`}
        right={
          <Status tone={budgetTone}>
            {budget.monthlyCapUsd > 0
              ? `${usd(budget.spentThisMonthUsd)} of ${usd(budget.monthlyCapUsd)} (${(budget.utilisation * 100).toFixed(0)}%)`
              : 'no monthly cap set'}
          </Status>
        }
      />
      <Panel className="mb-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="ad-panel-title mb-2">Spend by phase</div>
            {m.spendByPhase.length === 0
              ? <p className="text-sm text-white/45">No calls recorded yet.</p>
              : m.spendByPhase.map(p => (
                  <BarRow
                    key={p.phase} label={p.phase} value={p.costUsd}
                    max={Math.max(...m.spendByPhase.map(x => x.costUsd), 0.01)}
                    right={`${usd(p.costUsd)} · ${fmtInt(p.calls)} calls`}
                  />
                ))}
            <p className="text-[11.5px] text-white/40 mt-2">
              <strong>sweep</strong> is routine polling, <strong>verify</strong> the pre-send second
              opinion, <strong>click</strong> the re-query that measures the alert-to-click delta.
              Verification should be a small fraction of sweep; if it is not, the expensive provider is
              being used for routine work.
            </p>
          </div>
          <div>
            <div className="ad-panel-title mb-2">Spend by provider</div>
            {m.spendByProvider.length === 0
              ? <p className="text-sm text-white/45">No calls recorded yet.</p>
              : m.spendByProvider.map(p => (
                  <BarRow
                    key={p.provider} label={p.provider} value={p.costUsd}
                    max={Math.max(...m.spendByProvider.map(x => x.costUsd), 0.01)}
                    right={`${usd(p.costUsd)} · ${fmtInt(p.calls)} calls`}
                  />
                ))}
          </div>
        </div>
      </Panel>

      <SectionHead title="Margin per route" sub="Commission attributable minus poll cost" />
      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <Panel title="Cost against revenue" sub="The lower-right quadrant is being polled for nothing">
          <MarginScatter routes={m.routeMargin} />
        </Panel>
        <Panel title="Worst margin first" sub="The routes at the top are the ones to throttle">
          {worstRoutes.length === 0 ? (
            <p className="text-sm text-white/45">No route has recorded poll cost yet.</p>
          ) : (
            <Table head={['Route', 'Poll cost', 'Revenue', 'Margin', 'Clicks']}>
              {worstRoutes.map(r => (
                <tr key={r.routeKey}>
                  <td>{r.origin} → {r.destination}</td>
                  <td className="font-mono tabular-nums">{usd(r.pollCostUsd)}</td>
                  <td className="font-mono tabular-nums">{usd(r.commissionUsd)}</td>
                  <td className="font-mono tabular-nums">
                    <Status tone={r.marginUsd >= 0 ? 'good' : 'bad'}>{usd(r.marginUsd)}</Status>
                  </td>
                  <td className="font-mono tabular-nums">{fmtInt(r.clicks)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <SectionHead title="Earnings" sub="By product category, reconciled from the network" />
      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <Panel title="Commission by product" sub="Late-arriving attribution is handled by re-reading the window, not snapshotting">
          {m.commissionByProduct.length === 0 ? (
            <p className="text-sm text-white/45">
              No commission events in this window. Hotel commissions typically settle after checkout, so
              expect a lag of weeks rather than days.
            </p>
          ) : (
            <Table head={['Product', 'Events', 'Amount']}>
              {m.commissionByProduct.map(c => (
                <tr key={c.product}>
                  <td>{c.product}</td>
                  <td className="font-mono tabular-nums">{fmtInt(c.n)}</td>
                  <td className="font-mono tabular-nums">{fmtMoney(c.amountUsd, 2)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Zero-commission clicks by route" sub="Where the trip chain has to carry the revenue">
          {m.zeroCommissionByRoute.length === 0 ? (
            <p className="text-sm text-white/45">No click-outs recorded in this window.</p>
          ) : (
            <Table head={['Route', 'Clicks', 'Pay nothing', 'Share']}>
              {m.zeroCommissionByRoute.map(r => (
                <tr key={r.route}>
                  <td>{r.route}</td>
                  <td className="font-mono tabular-nums">{fmtInt(r.clicks)}</td>
                  <td className="font-mono tabular-nums">{fmtInt(r.zero)}</td>
                  <td className="font-mono tabular-nums">
                    <Status tone={r.pct >= 50 ? 'bad' : r.pct >= 25 ? 'warn' : 'neutral'}>
                      {r.pct.toFixed(0)}%
                    </Status>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <SectionHead title="Subscription revenue against poll cost" sub="Per account — does a seat clear what it costs to serve?" />
      <Panel>
        {m.subscriptionVsCost.length === 0 ? (
          <p className="text-sm text-white/45">No accounts yet.</p>
        ) : (
          <Table head={['Account', 'Tier', 'Routes', 'Poll cost · 30d']}>
            {m.subscriptionVsCost.filter(u => u.routes > 0 || u.pollCostUsd > 0).map(u => (
              <tr key={u.userId}>
                <td className="truncate max-w-[16rem]">{u.email}</td>
                <td className="capitalize">{u.tier}</td>
                <td className="font-mono tabular-nums">{fmtInt(u.routes)}</td>
                <td className="font-mono tabular-nums">{usd(u.pollCostUsd)}</td>
              </tr>
            ))}
          </Table>
        )}
        <p className="text-[11.5px] text-white/40 mt-3">
          A Pro seat has to clear the poll cost of that user&rsquo;s routes. The allocator caps the worst
          case; this table is how you check the cap is working.
        </p>
      </Panel>
    </div>
  );
}

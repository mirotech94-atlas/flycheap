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
 * single most useful widget ranks routes by poll cost against the revenue
 * they attribute: the routes at the top costing more than they earn are the
 * ones to throttle.
 */

function usd(n: number | null, digits = 2): string {
  return n == null ? '—' : `$${n.toFixed(digits)}`;
}

/**
 * Cost-vs-revenue ranked bars — the page's own per-route poll-cost vs
 * commission rows, ranked by poll cost. No time axis on this data (routes
 * aren't ordered by day), so this is BarRow/ranked rows rather than the
 * area-chart feature block; `BarRow`'s tone already resolves to
 * `--green`/`--red` via tokens, so nothing here is a literal colour.
 */
function RouteMarginRanked({ routes }: {
  routes: Array<{ routeKey: string; origin: string; destination: string; pollCostUsd: number; commissionUsd: number }>;
}) {
  if (routes.length === 0) {
    return <p className="ad-note">No routes have recorded poll cost in this window yet.</p>;
  }
  const ranked = [...routes].sort((a, b) => b.pollCostUsd - a.pollCostUsd).slice(0, 15);
  const max = Math.max(...ranked.map(r => r.pollCostUsd), 0.01);
  return (
    <div>
      {ranked.map(r => (
        <BarRow
          key={r.routeKey}
          label={`${r.origin} → ${r.destination}`}
          value={r.pollCostUsd}
          max={max}
          tone={r.commissionUsd >= r.pollCostUsd ? 'good' : 'bad'}
          right={`${usd(r.pollCostUsd)} cost · ${usd(r.commissionUsd)} rev`}
        />
      ))}
      <p className="ad-note mt-2">
        Bar length is poll cost, ranked highest first. Green means the route&rsquo;s revenue clears its cost;
        red means it does not.
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
              ? <p className="ad-note">No calls recorded yet.</p>
              : m.spendByPhase.map(p => (
                  <BarRow
                    key={p.phase} label={p.phase} value={p.costUsd}
                    max={Math.max(...m.spendByPhase.map(x => x.costUsd), 0.01)}
                    right={`${usd(p.costUsd)} · ${fmtInt(p.calls)} calls`}
                  />
                ))}
            <p className="ad-note mt-2">
              <strong>sweep</strong> is routine polling, <strong>verify</strong> the pre-send second
              opinion, <strong>click</strong> the re-query that measures the alert-to-click delta.
              Verification should be a small fraction of sweep; if it is not, the expensive provider is
              being used for routine work.
            </p>
          </div>
          <div>
            <div className="ad-panel-title mb-2">Spend by provider</div>
            {m.spendByProvider.length === 0
              ? <p className="ad-note">No calls recorded yet.</p>
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
        <Panel title="Cost against revenue" sub="Ranked by poll cost — red is costing more than it earns">
          <RouteMarginRanked routes={m.routeMargin} />
        </Panel>
        <Panel title="Worst margin first" sub="The routes at the top are the ones to throttle">
          {worstRoutes.length === 0 ? (
            <p className="ad-note">No route has recorded poll cost yet.</p>
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
            <p className="ad-note">
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
            <p className="ad-note">No click-outs recorded in this window.</p>
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
          <p className="ad-note">No accounts yet.</p>
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
        <p className="ad-note mt-3">
          A Pro seat has to clear the poll cost of that user&rsquo;s routes. The allocator caps the worst
          case; this table is how you check the cap is working.
        </p>
      </Panel>
    </div>
  );
}

import 'server-only';
import { queries } from './db';
import { computeVerdict } from './verdict';
import { buildWorkQueue, buildSavingsReport, type WatchInput, type QueueItem } from './workQueue';
import { groupsForOrg, getGroup } from './org';

/**
 * Server-side assembly of the org work queue.
 *
 * workQueue.ts is pure and holds the ORDERING decisions; this reads the rows and
 * computes the per-watch signals it needs. Keeping the split means the product
 * decision — what an agent should look at first — stays testable without a
 * database, and this file stays a data-loading concern.
 */

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (r[k] == null ? null : String(r[k]));
const num = (r: Row, k: string) => (r[k] == null ? null : Number(r[k]));

export function loadOrgQueue(orgId: number): {
  items: QueueItem[];
  watchCount: number;
  groupCount: number;
} {
  const rows = queries.watchesForOrg(orgId) as Row[];

  const watches: WatchInput[] = rows.map(r => {
    const id = Number(r.id);
    // The verdict and the route's own 30-day low, from the history we already
    // store. A target is only "unreachable" relative to what the route has
    // actually done, never relative to a number we invented.
    const history = queries.fareHistoryDaily(id, 30)
      .map(h => ({ polled_at: h.day, price_per_adult_usd: h.per_adult_usd }));
    const low30d = history.length ? Math.min(...history.map(h => h.price_per_adult_usd)) : null;
    const latest = queries.latestFare(id);
    const target = num(r, 'target_amount') ?? num(r, 'target_per_adult_usd');
    const v = latest && history.length
      ? computeVerdict(history, latest.price_per_adult_usd, target ?? 0)
      : null;

    return {
      id,
      groupId: Number(r.group_id),
      groupName: str(r, 'group_name') ?? 'Group',
      origin: String(r.origin),
      destination: String(r.destination),
      departDate: str(r, 'depart_date'),
      status: str(r, 'status') ?? 'active',
      verdict: v?.verdict ?? null,
      previousVerdict: queries.lastVerdictFor(id) as 'buy' | 'wait' | 'hold' | null,
      targetAmount: target,
      currentAmount: latest?.price_per_adult_usd ?? null,
      low30d,
      bookedAmountUsd: num(r, 'booked_amount_usd'),
    };
  });

  const inactive = queries.groupsWithNoActivity(orgId).map(g => ({ id: g.id, name: g.name }));

  return {
    items: buildWorkQueue({ watches, inactiveGroups: inactive }),
    watchCount: rows.length,
    groupCount: groupsForOrg(orgId).length,
  };
}

/** Savings for one group over a period, from the stored baselines. */
export function loadGroupSavings(groupId: number, periodStart: string, periodEnd: string) {
  const group = getGroup(groupId);
  const rows = queries.watchesForGroup(groupId) as Row[];
  return buildSavingsReport({
    groupId,
    groupName: group?.name ?? 'Group',
    periodStart,
    periodEnd,
    trips: rows.map(r => ({
      watchId: Number(r.id),
      route: `${r.origin} → ${r.destination}`,
      baselineUsd: num(r, 'baseline_amount_usd'),
      bookedUsd: num(r, 'booked_amount_usd'),
    })),
  });
}

/**
 * The org work queue.
 *
 * "The org home is not a list of groups, it is a work queue. What needs a human
 *  today... An agent should be able to work top-down and stop when the queue is
 *  empty. That is the difference between a tool that gets opened daily and one
 *  that gets opened when someone remembers."
 *
 * Pure: takes rows, returns an ordered queue. The ordering rules are the product
 * decision and they are testable without a database.
 */

import type { VerdictKind } from './verdict';

export type QueueReason =
  | 'verdict-flipped-to-buy'   // someone should act
  | 'departing-unbooked'       // inside 14 days, nothing confirmed
  | 'target-unreachable'       // reset expectations with the client
  | 'booking-unrecorded'       // departure passed with nothing marked booked
  | 'group-inactive';          // no activity in 30 days

export type QueueItem = {
  reason: QueueReason;
  /** Watch id, or null for a group-level row. */
  watchId: number | null;
  groupId: number;
  groupName: string;
  route: string | null;
  departDate: string | null;
  daysToDeparture: number | null;
  /** One line telling the agent what happened and what to do about it. */
  detail: string;
  /** Lower sorts first. */
  rank: number;
};

/** Inside this many days with no booking, an agent should be looking at it. */
export const DEPARTING_SOON_DAYS = 14;
/** A target this far above the route's own 30-day low is not going to happen. */
export const UNREACHABLE_MARGIN_PCT = 25;
/** Silence this long on a client is itself the thing to act on. */
export const INACTIVE_DAYS = 30;

/**
 * Rank, and therefore the order the agent works in.
 *
 * Deliberately: act-now first, then time-pressure, then conversations that need
 * having, then housekeeping. A queue that opens with "this group has been quiet"
 * above "this fare is buyable today" trains people to skim it.
 */
const RANK: Record<QueueReason, number> = {
  'verdict-flipped-to-buy': 0,
  'departing-unbooked': 100,
  'booking-unrecorded': 200,
  'target-unreachable': 300,
  'group-inactive': 400,
};

export type WatchInput = {
  id: number;
  groupId: number;
  groupName: string;
  origin: string;
  destination: string;
  departDate: string | null;
  status: string;
  verdict?: VerdictKind | null;
  previousVerdict?: VerdictKind | null;
  targetAmount?: number | null;
  currentAmount?: number | null;
  /** The route's own 30-day low, for judging whether a target is reachable. */
  low30d?: number | null;
  bookedAmountUsd?: number | null;
};

export type GroupInput = { id: number; name: string };

function daysTo(date: string | null | undefined, nowMs: number): number | null {
  if (!date) return null;
  const t = Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.round((t - nowMs) / 86_400_000);
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * Build the queue.
 *
 * A watch can legitimately appear for more than one reason — a trip departing in
 * three days whose verdict just flipped to buy is two separate things an agent
 * needs to know. Collapsing them to one row would hide whichever we judged less
 * important, so both appear and the ordering decides which is read first.
 */
export function buildWorkQueue(input: {
  watches: WatchInput[];
  inactiveGroups?: GroupInput[];
  nowMs?: number;
}): QueueItem[] {
  const now = input.nowMs ?? Date.now();
  const items: QueueItem[] = [];

  for (const w of input.watches) {
    const days = daysTo(w.departDate, now);
    const route = `${w.origin} → ${w.destination}`;
    const common = {
      watchId: w.id, groupId: w.groupId, groupName: w.groupName,
      route, departDate: w.departDate ?? null, daysToDeparture: days,
    };

    // 1. Someone should act.
    if (w.status !== 'booked' && w.previousVerdict === 'wait' && w.verdict === 'buy') {
      items.push({
        ...common,
        reason: 'verdict-flipped-to-buy',
        rank: RANK['verdict-flipped-to-buy'],
        detail: `We've changed our call to BUY${w.currentAmount != null ? ` at ${money(w.currentAmount)}` : ''}. `
          + `Worth telling ${w.groupName} today.`,
      });
    }

    // 2. Time pressure.
    if (w.status !== 'booked' && days != null && days >= 0 && days <= DEPARTING_SOON_DAYS) {
      items.push({
        ...common,
        reason: 'departing-unbooked',
        rank: RANK['departing-unbooked'] + days,  // soonest first within the band
        detail: `Departs in ${days} day${days === 1 ? '' : 's'} and nothing is marked booked.`,
      });
    }

    // 3. Departure passed with nothing recorded. The savings report has no
    //    numerator without this, so the queue chases it rather than waiting.
    if (w.status !== 'booked' && days != null && days < 0) {
      items.push({
        ...common,
        reason: 'booking-unrecorded',
        rank: RANK['booking-unrecorded'],
        detail: `Departed ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago with nothing `
          + `recorded. Mark what was paid, or the savings report cannot count this trip.`,
      });
    }

    // 4. A conversation that needs having.
    if (
      w.status !== 'booked'
      && w.targetAmount != null && w.low30d != null && w.low30d > 0
      && w.targetAmount < w.low30d * (1 - UNREACHABLE_MARGIN_PCT / 100)
    ) {
      items.push({
        ...common,
        reason: 'target-unreachable',
        rank: RANK['target-unreachable'],
        detail: `Target ${money(w.targetAmount)} is well under the 30-day low of ${money(w.low30d)}. `
          + `Worth resetting expectations with ${w.groupName}.`,
      });
    }
  }

  for (const g of input.inactiveGroups ?? []) {
    items.push({
      reason: 'group-inactive',
      rank: RANK['group-inactive'],
      watchId: null, groupId: g.id, groupName: g.name,
      route: null, departDate: null, daysToDeparture: null,
      detail: `No watches, bookings or alerts in ${INACTIVE_DAYS} days.`,
    });
  }

  return items.sort((a, b) => a.rank - b.rank || a.groupName.localeCompare(b.groupName));
}

// ---------------------------------------------------------------------------
// Savings
// ---------------------------------------------------------------------------

export type SavingsLine = {
  watchId: number;
  route: string;
  baselineUsd: number;
  bookedUsd: number;
  savedUsd: number;
  savedPct: number;
};

export type SavingsReport = {
  groupId: number;
  groupName: string;
  periodStart: string;
  periodEnd: string;
  lines: SavingsLine[];
  totalSavedUsd: number;
  /** Trips we could not score, and why — stated rather than quietly dropped. */
  unscored: Array<{ watchId: number; route: string; reason: string }>;
};

/**
 * Savings for a group over a period.
 *
 * The baseline is the fare AT THE TIME THE TRIP WAS REQUESTED, captured once and
 * never recomputed. A baseline that drifts turns the report into a number the
 * agency cannot defend to their client — and they have to defend it, not us.
 *
 * A trip with no baseline or no booked amount is listed as UNSCORED with the
 * reason, never silently excluded. A savings total that quietly omits the trips
 * that went badly is worse than no report; the first time a client notices, the
 * whole document stops being believed.
 */
export function buildSavingsReport(input: {
  groupId: number;
  groupName: string;
  periodStart: string;
  periodEnd: string;
  trips: Array<{
    watchId: number; route: string;
    baselineUsd: number | null; bookedUsd: number | null;
  }>;
}): SavingsReport {
  const lines: SavingsLine[] = [];
  const unscored: SavingsReport['unscored'] = [];

  for (const t of input.trips) {
    if (t.baselineUsd == null || !(t.baselineUsd > 0)) {
      unscored.push({ watchId: t.watchId, route: t.route, reason: 'no baseline captured' });
      continue;
    }
    if (t.bookedUsd == null) {
      unscored.push({ watchId: t.watchId, route: t.route, reason: 'not marked booked' });
      continue;
    }
    const savedUsd = t.baselineUsd - t.bookedUsd;
    lines.push({
      watchId: t.watchId,
      route: t.route,
      baselineUsd: t.baselineUsd,
      bookedUsd: t.bookedUsd,
      savedUsd,
      savedPct: (savedUsd / t.baselineUsd) * 100,
    });
  }

  return {
    groupId: input.groupId,
    groupName: input.groupName,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    lines,
    // Includes negative lines. A trip that cost MORE than its baseline belongs in
    // the total; hiding it would be the same dishonesty as hiding the unscored.
    totalSavedUsd: lines.reduce((sum, l) => sum + l.savedUsd, 0),
    unscored,
  };
}

/**
 * The renewal number: year-to-date savings against what they paid us.
 *
 * "A university office renewing a contract needs one number to take to a dean,
 *  and if your product does not produce it they will produce it themselves,
 *  badly, or not at all."
 *
 * Returns null for the ratio rather than dividing by zero, and never rounds a
 * loss up to zero.
 */
export function renewalSummary(input: {
  totalSavedUsd: number;
  subscriptionCostUsd: number;
  tripsScored: number;
  tripsUnscored: number;
}): {
  savedUsd: number;
  costUsd: number;
  netUsd: number;
  multiple: number | null;
  coveragePct: number | null;
} {
  const total = input.tripsScored + input.tripsUnscored;
  return {
    savedUsd: input.totalSavedUsd,
    costUsd: input.subscriptionCostUsd,
    netUsd: input.totalSavedUsd - input.subscriptionCostUsd,
    multiple: input.subscriptionCostUsd > 0
      ? input.totalSavedUsd / input.subscriptionCostUsd
      : null,
    // How much of their travel we can actually speak to. A 12x return measured
    // on a fifth of their trips is a different claim from one measured on all
    // of them, and the report should make that visible.
    coveragePct: total > 0 ? (input.tripsScored / total) * 100 : null,
  };
}

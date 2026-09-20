import 'server-only';
import { getDb, queries, limitsForUser } from './db';
import { routeKey, providerCosts } from './providerCost';
import type { SearchRow } from './db';
import type { ProviderId } from './providers/types';

/**
 * Poll budget allocator — score, then spend.
 *
 * Fixed-cadence polling by plan tier is the wrong model. It charges the most for
 * the routes that deserve it least (a Pro seat's hundredth route, watched by
 * nobody, months from departure, polled every 30 minutes) and it caps how many
 * users the business can afford.
 *
 * Instead: give every tracked route a priority score, sort, and spend the budget
 * top-down in BANDS rather than on a continuous cadence — bands stay debuggable,
 * and "why is this route being polled every four hours" has an answer you can
 * read off a page.
 *
 * This is also the argument for moving the paid tiers off polling cadence and
 * onto route count and features. A Pro user keeps all 100 routes; the
 * low-priority ones simply poll less often. Polling speed is an implementation
 * detail a user cannot feel. Route count and sharing are wants they can.
 */

export type Band = 'hot' | 'warm' | 'cool' | 'cold';

/** Cadence per band, in minutes. The spec's table. */
export const BAND_CADENCE_MIN: Record<Band, number> = {
  hot: 5,      // 2–5 min
  warm: 30,    // 15–30 min
  cool: 240,   // 2–6 h
  cold: 1440,  // daily — history maintenance only, for the route pages
};

export const BAND_ORDER: Band[] = ['hot', 'warm', 'cool', 'cold'];

/** Demote by one band. Cold has nowhere further to fall. */
export function demote(band: Band): Band {
  const i = BAND_ORDER.indexOf(band);
  return BAND_ORDER[Math.min(i + 1, BAND_ORDER.length - 1)];
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Weights, editable without a deploy via the `poll_priority_weights` setting.
 * Defaults are the spec's ordering: people watching it matters most, then how
 * close it is to someone's target, then how volatile and how imminent it is.
 */
export type Weights = {
  watcherCount: number;
  volatility30d: number;
  proximityToThreshold: number;
  departureUrgency: number;
  historicalConversion: number;
  pollCostPerCall: number;
};

export const DEFAULT_WEIGHTS: Weights = {
  watcherCount: 1.0,
  volatility30d: 0.8,
  proximityToThreshold: 1.4,
  departureUrgency: 1.0,
  historicalConversion: 0.6,
  pollCostPerCall: 0.5,
};

export function weights(): Weights {
  const raw = queries.getSetting('poll_priority_weights');
  if (!raw) return DEFAULT_WEIGHTS;
  try {
    const parsed = JSON.parse(raw) as Partial<Weights>;
    const merged = { ...DEFAULT_WEIGHTS };
    for (const k of Object.keys(DEFAULT_WEIGHTS) as Array<keyof Weights>) {
      const v = parsed[k];
      if (typeof v === 'number' && Number.isFinite(v)) merged[k] = v;
    }
    return merged;
  } catch {
    console.warn('[pollBudget] poll_priority_weights is not valid JSON — using defaults');
    return DEFAULT_WEIGHTS;
  }
}

export type RouteSignals = {
  searchId: number;
  routeKey: string;
  userId: number;
  /** Distinct users watching this canonical route. Deduplication makes this > 1. */
  watcherCount: number;
  /** stdev / mean over the last 30 days. 0 when there is no history. */
  volatility30d: number;
  /** How close the live fare is to the nearest watcher's target, 0–1 (1 = at it). */
  proximityToThreshold: number;
  /** Days to the start of the date window, and the 0–1 urgency derived from it. */
  daysToDeparture: number | null;
  departureUrgency: number;
  /** Has this route ever produced a click-out? 0–1. */
  historicalConversion: number;
  /** USD per call for the providers this route would use. */
  pollCostPerCall: number;
  /** Most recent per-adult price, when known. */
  lastPrice: number | null;
  /** Percent the price moved on the last cycle (negative = fell). */
  lastMovePct: number | null;
};

export type ScoredRoute = RouteSignals & { score: number; band: Band; reason: string };

/** The spec's priority formula. */
export function priorityScore(s: RouteSignals, w: Weights = DEFAULT_WEIGHTS): number {
  return (
    w.watcherCount * Math.log1p(s.watcherCount) +
    w.volatility30d * s.volatility30d +
    w.proximityToThreshold * s.proximityToThreshold +
    w.departureUrgency * s.departureUrgency +
    w.historicalConversion * s.historicalConversion -
    w.pollCostPerCall * s.pollCostPerCall
  );
}

/**
 * Which band a route qualifies for on its own merits, before budget pressure.
 *
 * The qualifying rules are the spec's, not the score's: a route is Hot because
 * of what is true about it (near someone's target, or departing soon), not
 * because it happened to sort highly. The score decides order WITHIN the budget,
 * the rules decide the ceiling.
 */
export function qualifyingBand(s: RouteSignals): { band: Band; reason: string } {
  if (s.watcherCount === 0) {
    return { band: 'cold', reason: 'no active watcher — history maintenance only' };
  }
  if (s.proximityToThreshold >= 0.9) {
    return { band: 'hot', reason: 'live fare within ~10% of a watcher’s target' };
  }
  if (s.daysToDeparture != null && s.daysToDeparture <= 21) {
    return { band: 'hot', reason: `departure in ${s.daysToDeparture} days` };
  }
  if (s.proximityToThreshold < 0.5 && (s.daysToDeparture == null || s.daysToDeparture > 120)) {
    return { band: 'cool', reason: 'far from target, departure months out' };
  }
  return { band: 'warm', reason: 'active watcher, ordinary distance from target' };
}

/**
 * The promotion rule, and the reason the whole scheme works.
 *
 * A fare rarely goes from normal to 3σ without passing through a visible move
 * first. Promoting anything that just moved sharply preserves the mistake-fare
 * catch rate while cutting most of the spend — without it, cutting Cool routes
 * to a six-hour cadence would mean missing the anomalies they exist to catch.
 */
export const PROMOTION_MOVE_PCT = 8;

export function applyPromotion(band: Band, lastMovePct: number | null): { band: Band; promoted: boolean } {
  if (lastMovePct != null && lastMovePct <= -PROMOTION_MOVE_PCT && band !== 'hot') {
    return { band: 'hot', promoted: true };
  }
  return { band, promoted: false };
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * Gather the scoring signals for every active route in one pass.
 *
 * Deliberately a handful of grouped queries rather than per-route lookups: this
 * runs on every scheduler tick, and N+1 here would cost more than the polling it
 * is meant to economise.
 */
export function gatherSignals(searches: SearchRow[]): RouteSignals[] {
  const db = getDb();
  if (searches.length === 0) return [];

  const ids = searches.map(s => s.id);
  const placeholders = ids.map(() => '?').join(',');

  const stats = new Map<number, { mean: number; stdev: number; last: number | null; prev: number | null }>();
  for (const r of db.prepare(
    `SELECT search_id,
            AVG(price_per_adult_usd) AS mean,
            COUNT(*) AS n,
            AVG(price_per_adult_usd * price_per_adult_usd) AS meansq
       FROM fare_snapshots
      WHERE search_id IN (${placeholders}) AND polled_at >= datetime('now','-30 days')
      GROUP BY search_id`,
  ).all(...ids) as Array<{ search_id: number; mean: number; n: number; meansq: number }>) {
    const variance = Math.max(0, r.meansq - r.mean * r.mean);
    stats.set(r.search_id, { mean: r.mean, stdev: Math.sqrt(variance), last: null, prev: null });
  }

  // Last two prices per route, for the promotion rule.
  for (const r of db.prepare(
    `SELECT search_id, price_per_adult_usd, polled_at,
            ROW_NUMBER() OVER (PARTITION BY search_id ORDER BY polled_at DESC) AS rn
       FROM fare_snapshots
      WHERE search_id IN (${placeholders}) AND polled_at >= datetime('now','-14 days')`,
  ).all(...ids) as Array<{ search_id: number; price_per_adult_usd: number; rn: number }>) {
    if (r.rn > 2) continue;
    const cur = stats.get(r.search_id) ?? { mean: 0, stdev: 0, last: null, prev: null };
    if (r.rn === 1) cur.last = r.price_per_adult_usd;
    if (r.rn === 2) cur.prev = r.price_per_adult_usd;
    stats.set(r.search_id, cur);
  }

  // Routes that have ever produced a click-out.
  const converting = new Set(
    (db.prepare(
      `SELECT DISTINCT search_id FROM affiliate_clicks WHERE search_id IS NOT NULL`,
    ).all() as Array<{ search_id: number }>).map(r => r.search_id),
  );

  // Watchers per CANONICAL route: two users watching JFK→CAI with overlapping
  // date windows are one poll, not two, and the shared poll is worth more than
  // either would be alone.
  const watchers = new Map<string, Set<number>>();
  for (const s of searches) {
    const key = routeKey({
      origin: s.origin, destination: s.destination,
      departDate: s.depart_date, returnDate: s.return_date,
      adults: s.adults, infants: s.infants,
    });
    if (!watchers.has(key)) watchers.set(key, new Set());
    watchers.get(key)!.add(s.user_id ?? 0);
  }

  const globalTarget = parseFloat(queries.getSetting('alert_threshold_per_adult_usd') ?? '900');

  return searches.map(s => {
    const key = routeKey({
      origin: s.origin, destination: s.destination,
      departDate: s.depart_date, returnDate: s.return_date,
      adults: s.adults, infants: s.infants,
    });
    const st = stats.get(s.id);
    const volatility = st && st.mean > 0 ? st.stdev / st.mean : 0;

    const target = s.target_per_adult_usd
      ?? parseFloat(queries.getUserSetting(s.user_id ?? 1, 'alert_threshold_per_adult_usd') ?? String(globalTarget));

    // 1 when the live fare is at or below target, falling off as it moves away.
    const last = st?.last ?? null;
    const proximity = last != null && target > 0
      ? Math.max(0, Math.min(1, 1 - Math.max(0, last - target) / target))
      : 0.5; // no price yet — mid, so a new route is neither starved nor favoured

    const days = daysUntil(s.depart_date);
    // 1 inside three weeks, decaying to 0 at a year out.
    const urgency = days == null ? 0 : Math.max(0, Math.min(1, 1 - (days - 21) / 344));

    const lastMovePct = st?.last != null && st?.prev != null && st.prev > 0
      ? ((st.last - st.prev) / st.prev) * 100
      : null;

    return {
      searchId: s.id,
      routeKey: key,
      userId: s.user_id ?? 1,
      watcherCount: watchers.get(key)?.size ?? 1,
      volatility30d: volatility,
      proximityToThreshold: proximity,
      daysToDeparture: days,
      departureUrgency: urgency,
      historicalConversion: converting.has(s.id) ? 1 : 0,
      pollCostPerCall: currentPollCostPerCall(),
      lastPrice: last,
      lastMovePct,
    };
  });
}

function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const t = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

/** Summed cost of one fan-out across the currently enabled providers. */
function currentPollCostPerCall(): number {
  const costs = providerCosts();
  const enabled = (queries.getSetting('enabled_providers') ?? 'travelpayouts')
    .split(',').map(s => s.trim()).filter(Boolean);
  return enabled.reduce((sum, p) => sum + (costs[p] ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export type BudgetState = {
  monthlyCapUsd: number;
  spentThisMonthUsd: number;
  /** 0–1+. Above 0.8 everything below Hot is demoted a band; at 1.0, Hot only. */
  utilisation: number;
  /** How many bands to demote everything by. */
  demoteBy: number;
  hotOnly: boolean;
};

/**
 * Graceful degradation, not a cliff. At 80% of the cap everything below Hot
 * drops one band and the fact is logged; at 100%, Hot only. The current burn is
 * surfaced on the admin cost dashboard so this is never a surprise.
 */
export function budgetState(): BudgetState {
  const cap = parseFloat(queries.getSetting('poll_budget_monthly_usd') ?? '0') || 0;
  const spent = (getDb().prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) AS c FROM api_calls
      WHERE called_at >= datetime('now','start of month')`,
  ).get() as { c: number }).c;

  if (cap <= 0) {
    return { monthlyCapUsd: 0, spentThisMonthUsd: spent, utilisation: 0, demoteBy: 0, hotOnly: false };
  }
  const utilisation = spent / cap;
  return {
    monthlyCapUsd: cap,
    spentThisMonthUsd: spent,
    utilisation,
    demoteBy: utilisation >= 0.8 && utilisation < 1 ? 1 : 0,
    hotOnly: utilisation >= 1,
  };
}

/**
 * Per-account soft cap: one Pro user tracking 100 obscure routes must not
 * consume a disproportionate share of the Hot band. They keep all 100 routes —
 * the low-priority ones simply poll less often.
 */
export function perAccountHotCap(userId: number): number {
  const limits = limitsForUser(queries.getUserById(userId));
  // A quarter of the account's route allowance, floor 3, so a Free user's five
  // routes are not all demoted and an Enterprise account cannot take everything.
  return Math.max(3, Math.floor(limits.maxRoutes / 4));
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

export type Allocation = {
  routes: ScoredRoute[];
  budget: BudgetState;
  /** Canonical keys and the searches that share each one. */
  dedup: Map<string, number[]>;
};

/** Score every route, assign bands, apply promotion, budget and per-account caps. */
export function allocate(searches: SearchRow[]): Allocation {
  const w = weights();
  const budget = budgetState();
  const signals = gatherSignals(searches);

  const scored: ScoredRoute[] = signals.map(s => {
    const q = qualifyingBand(s);
    const promoted = applyPromotion(q.band, s.lastMovePct);
    return {
      ...s,
      score: priorityScore(s, w),
      band: promoted.band,
      reason: promoted.promoted
        ? `promoted to hot: fell ${Math.abs(s.lastMovePct ?? 0).toFixed(1)}% on the last cycle`
        : q.reason,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // Per-account Hot cap, applied in score order so an account's best routes keep
  // the band and its tail is what gets demoted.
  const hotUsed = new Map<number, number>();
  for (const r of scored) {
    if (r.band !== 'hot') continue;
    const used = hotUsed.get(r.userId) ?? 0;
    if (used >= perAccountHotCap(r.userId)) {
      r.band = demote(r.band);
      r.reason = 'demoted: per-account hot cap reached';
    } else {
      hotUsed.set(r.userId, used + 1);
    }
  }

  // Budget pressure, last, so it is applied to the final picture.
  if (budget.hotOnly) {
    for (const r of scored) {
      if (r.band !== 'hot') {
        r.band = 'cold';
        r.reason = 'monthly poll budget exhausted — hot band only';
      }
    }
  } else if (budget.demoteBy > 0) {
    for (const r of scored) {
      if (r.band === 'hot') continue;
      r.band = demote(r.band);
      r.reason = `${(budget.utilisation * 100).toFixed(0)}% of monthly poll budget spent — demoted one band`;
    }
  }

  const dedup = new Map<string, number[]>();
  for (const r of scored) {
    if (!dedup.has(r.routeKey)) dedup.set(r.routeKey, []);
    dedup.get(r.routeKey)!.push(r.searchId);
  }

  return { routes: scored, budget, dedup };
}

/**
 * Providers for a band.
 *
 * Cheap or flat-rate providers carry Cool and Cold. The expensive one is used
 * for Hot-band confirmation and the pre-send verification pass, never for
 * routine sweeps. Editable without a deploy, per the spec: the routing table is
 * `provider_routing`, a JSON map of band → provider ids.
 */
export function providersForBand(band: Band): ProviderId[] | null {
  const raw = queries.getSetting('provider_routing');
  if (!raw) return null; // null = use the global enabled list
  try {
    const map = JSON.parse(raw) as Partial<Record<Band, string[]>>;
    const ids = map[band];
    return Array.isArray(ids) && ids.length > 0 ? (ids as ProviderId[]) : null;
  } catch {
    console.warn('[pollBudget] provider_routing is not valid JSON — falling back to enabled providers');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rollout mode
// ---------------------------------------------------------------------------

/**
 * How much authority the allocator actually has.
 *
 * This is gated deliberately. The pricing page currently promises Pro users
 * "30-minute polling — 8x faster than Free". The allocator's Cool band is four
 * hours and Cold is daily, so switching it on at full authority would quietly
 * make a paying customer's low-priority routes poll eight times SLOWER than
 * what they were sold. The spec's answer is to reposition the paid tiers around
 * route count and features and let cadence be demand-driven — but that is a
 * pricing decision, not an implementation detail, and it is not mine to make
 * silently.
 *
 *   'shadow'      score and record bands, change nothing. Reports what full
 *                 authority WOULD have saved, so the pricing decision can be
 *                 made against a real number instead of an argument.
 *   'tier-capped' allocator decides cadence, but never slower than the tier
 *                 promise. Safe to run today; saves on Free and ownerless
 *                 routes only.  ← default
 *   'full'        the spec's behaviour. Turn on once the pricing page no longer
 *                 sells a polling interval.
 */
export type AllocatorMode = 'shadow' | 'tier-capped' | 'full';

export function allocatorMode(): AllocatorMode {
  const raw = (queries.getSetting('poll_allocator_mode') ?? 'tier-capped').trim();
  return raw === 'shadow' || raw === 'full' ? raw : 'tier-capped';
}

/**
 * The cadence to actually use for a route, given the mode and the tier promise.
 * Returns minutes.
 */
export function effectiveCadenceMin(opts: {
  band: Band;
  userId: number;
  mode?: AllocatorMode;
}): number {
  const mode = opts.mode ?? allocatorMode();
  const tierMin = limitsForUser(queries.getUserById(opts.userId)).pollIntervalMin;
  const bandMin = BAND_CADENCE_MIN[opts.band];

  if (mode === 'shadow') return tierMin;
  if (mode === 'full') return bandMin;
  // tier-capped: the allocator may poll a route MORE often than its tier
  // (promotion to Hot is a benefit, never a downgrade), but never less often
  // than what the tier was sold as.
  return Math.min(bandMin, tierMin);
}

/**
 * What full authority would have saved this cycle, versus what the current mode
 * actually spends. Lets the pricing decision be made against a measured number.
 */
export function projectedSavings(routes: ScoredRoute[]): {
  callsPerDayNow: number;
  callsPerDayAtFullAuthority: number;
  savedPct: number;
} {
  const mode = allocatorMode();
  let now = 0;
  let full = 0;
  for (const r of routes) {
    now += 1440 / effectiveCadenceMin({ band: r.band, userId: r.userId, mode });
    full += 1440 / BAND_CADENCE_MIN[r.band];
  }
  return {
    callsPerDayNow: Math.round(now),
    callsPerDayAtFullAuthority: Math.round(full),
    savedPct: now > 0 ? ((now - full) / now) * 100 : 0,
  };
}

/** Has this route waited out its effective cadence? */
export function dueForPoll(opts: {
  band: Band;
  userId: number;
  lastPolledAt: string | null;
  mode?: AllocatorMode;
}): boolean {
  if (!opts.lastPolledAt) return true;
  const raw = opts.lastPolledAt;
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  const ageMin = (Date.now() - t) / 60_000;
  // One minute of slack so scheduler jitter never skips a whole cycle.
  return ageMin >= effectiveCadenceMin(opts) - 1;
}

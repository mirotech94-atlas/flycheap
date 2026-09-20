import 'server-only';
import { queries, getDb } from './db';
import { routeKey } from './providerCost';

/**
 * Score our own buy/wait calls, continuously.
 *
 * "This is uncomfortable to build and it is your strongest asset. Publishing a
 * real hit rate is something no competitor in this space does, and it converts
 * the confidence percentage from a claim into a measured quantity."
 *
 * For every fare called `buy`, we record whether it went lower within 7 and 14
 * days. For every `wait`, whether waiting actually paid. `hold` is scored as a
 * correct call when the price stayed inside a narrow band — a hold that was
 * followed by a large move in either direction was a missed call, not a
 * cautious one.
 *
 * Nothing here is allowed to invent a number. A call with no price history
 * inside its horizon is left unscored rather than counted as correct, because
 * an accuracy figure padded with absent evidence is worse than no figure.
 */

/** A buy is wrong if the price later fell by more than this. */
export const BUY_TOLERANCE_PCT = 3;
/** A wait only paid if the price fell by at least this much. */
export const WAIT_THRESHOLD_PCT = 3;
/** A hold was right if the price stayed within this band either way. */
export const HOLD_BAND_PCT = 5;

export type ScoredVerdict = 'buy' | 'wait' | 'hold';

/**
 * Was the call right, given the lowest price seen inside the horizon?
 * Returns null when there is no evidence — never a default.
 */
export function judge(
  verdict: ScoredVerdict,
  priceAtCall: number,
  minPriceAfter: number | null,
  maxPriceAfter: number | null = null,
): boolean | null {
  if (minPriceAfter == null || !Number.isFinite(minPriceAfter) || priceAtCall <= 0) return null;
  const dropPct = ((priceAtCall - minPriceAfter) / priceAtCall) * 100;

  if (verdict === 'buy') {
    // "Buy now" was right unless it then got materially cheaper.
    return dropPct <= BUY_TOLERANCE_PCT;
  }
  if (verdict === 'wait') {
    // "Wait" was right only if waiting actually saved money.
    return dropPct >= WAIT_THRESHOLD_PCT;
  }
  // hold — right when the price went nowhere much in either direction.
  const risePct = maxPriceAfter != null && Number.isFinite(maxPriceAfter)
    ? ((maxPriceAfter - priceAtCall) / priceAtCall) * 100
    : 0;
  return dropPct <= HOLD_BAND_PCT && risePct <= HOLD_BAND_PCT;
}

/**
 * Record a call, at most once per search per day.
 *
 * The poller runs every few minutes; we are scoring a judgement, not a sample
 * rate. Recording every poll would let a route that is polled often dominate
 * the published accuracy figure purely by volume.
 */
export function recordVerdictCall(opts: {
  searchId: number;
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  adults?: number;
  infants?: number;
  verdict: ScoredVerdict;
  confidencePct: number;
  pricePerAdult: number;
}): void {
  try {
    queries.insertVerdictCall({
      search_id: opts.searchId,
      route_key: routeKey({
        origin: opts.origin, destination: opts.destination,
        departDate: opts.departDate, returnDate: opts.returnDate,
        adults: opts.adults, infants: opts.infants,
      }),
      origin: opts.origin,
      destination: opts.destination,
      verdict: opts.verdict,
      confidence_pct: Math.round(opts.confidencePct),
      price_at_call_usd: opts.pricePerAdult,
    });
  } catch (e) {
    console.error('[verdictScoring] recordVerdictCall failed:', (e as Error).message);
  }
}

/** Highest per-adult price seen within N days after a moment. */
function maxPriceAfter(searchId: number, sinceIso: string, days: number): number | null {
  const row = getDb().prepare(
    `SELECT MAX(price_per_adult_usd) AS p FROM fare_snapshots
      WHERE search_id = ? AND polled_at > ? AND polled_at <= datetime(?, ?)
        AND COALESCE(verify_outcome, 'ok') <> 'dead'`,
  ).get(searchId, sinceIso, sinceIso, `+${Math.floor(days)} days`) as { p: number | null };
  return row?.p ?? null;
}

export type ScoringRun = { horizonDays: number; considered: number; scored: number; skipped: number };

/** Score every call whose horizon has elapsed. Idempotent — re-running is safe. */
export function scoreDueVerdicts(horizonDays: 7 | 14): ScoringRun {
  const column = horizonDays === 7 ? 'correct_7d' : 'correct_14d';
  const minColumn = horizonDays === 7 ? 'min_price_7d_usd' : 'min_price_14d_usd';
  const due = queries.verdictCallsDueForScoring(horizonDays, column);

  let scored = 0;
  let skipped = 0;
  for (const call of due) {
    const min = queries.minPriceAfter(call.search_id, call.called_at, horizonDays);
    const max = call.verdict === 'hold' ? maxPriceAfter(call.search_id, call.called_at, horizonDays) : null;
    const correct = judge(call.verdict as ScoredVerdict, call.price_at_call_usd, min, max);
    if (correct == null) {
      // No history inside the horizon. Leave it unscored — an accuracy figure
      // padded with absent evidence is worse than a smaller honest one.
      skipped++;
      continue;
    }
    queries.scoreVerdictCall(call.id, {
      column, minColumn, correct: correct ? 1 : 0, minPrice: min,
    });
    scored++;
  }
  return { horizonDays, considered: due.length, scored, skipped };
}

export type VerdictAccuracy = {
  horizonDays: 7 | 14;
  /** Scored calls only. Never includes calls we had no evidence for. */
  scored: number;
  correct: number;
  accuracyPct: number | null;
  byVerdict: Array<{ verdict: string; scored: number; correct: number; accuracyPct: number | null }>;
};

/**
 * The published number. Returns null accuracy rather than 0 when there is not
 * enough scored history to state one — the marketing site must be able to tell
 * "we don't know yet" apart from "we are wrong every time".
 */
export function verdictAccuracy(horizonDays: 7 | 14, minSample = 20): VerdictAccuracy {
  const column = horizonDays === 7 ? 'correct_7d' : 'correct_14d';
  const db = getDb();
  const totals = db.prepare(
    `SELECT COUNT(*) AS scored, COALESCE(SUM(${column}), 0) AS correct
       FROM verdict_calls WHERE ${column} IS NOT NULL`,
  ).get() as { scored: number; correct: number };

  const byVerdict = (db.prepare(
    `SELECT verdict, COUNT(*) AS scored, COALESCE(SUM(${column}), 0) AS correct
       FROM verdict_calls WHERE ${column} IS NOT NULL
      GROUP BY verdict ORDER BY scored DESC`,
  ).all() as Array<{ verdict: string; scored: number; correct: number }>)
    // Same floor as the headline. "buy: 1 scored, 100%" is not a hit rate, and
    // the per-call table sits directly under a KPI that correctly withholds.
    .map(r => ({ ...r, accuracyPct: r.scored >= minSample ? (r.correct / r.scored) * 100 : null }));

  return {
    horizonDays,
    scored: totals.scored,
    correct: totals.correct,
    accuracyPct: totals.scored >= minSample ? (totals.correct / totals.scored) * 100 : null,
    byVerdict,
  };
}

import 'server-only';
import { cache } from 'react';
import { getDb, type FareRow } from './db';
import { loadDashboard } from './dashboard-data';
import { composeCard, sortBoard, type BoardCard } from './boardCard';
import { buildTrackRecord, routeFamily, type TrackRecord } from './verdictAnatomy';
import type { WatchRow } from './watch';

/**
 * The board, for one account.
 *
 * Thin on purpose: every decision the screen makes lives in boardCard.ts, which
 * is pure. This file only fetches.
 */

/** The verification columns live on fare_snapshots; loadDashboard does SELECT *. */
type VerifiedFare = FareRow & {
  verified_at?: string | null;
  verify_outcome?: string | null;
};

/**
 * Scored verdict calls per route, in ONE query.
 *
 * Per-card queries would be fine at today's route counts, but the board is the
 * screen every session opens with and it is the one place a per-row query would
 * be felt first.
 */
function trackRecords(horizonDays: 7 | 14 = 14): Map<string, TrackRecord> {
  const column = horizonDays === 7 ? 'correct_7d' : 'correct_14d';
  const out = new Map<string, TrackRecord>();
  try {
    const rows = getDb().prepare(
      `SELECT origin, destination,
              COUNT(*) AS scored,
              COALESCE(SUM(${column}), 0) AS correct
         FROM verdict_calls
        WHERE ${column} IS NOT NULL
        GROUP BY origin, destination`,
    ).all() as Array<{ origin: string; destination: string; scored: number; correct: number }>;
    for (const r of rows) {
      const family = routeFamily(r.origin, r.destination);
      out.set(family, buildTrackRecord({
        routeFamily: family, scored: r.scored, correct: r.correct, horizonDays,
      }));
    }
  } catch {
    // No scored history yet is the normal case, not an error. Every card then
    // takes the model-score branch, which says so in words.
  }
  return out;
}

/**
 * Cached for the life of ONE request.
 *
 * The detail page calls loadBoardCard twice per render — once in
 * generateMetadata and once in the component — and Next does not dedupe across
 * those two. Without this, opening one watch runs the whole board load twice:
 * a LIMIT-1 query per route, a 30-day GROUP BY over all of them, and a scan of
 * verdict_calls, all to keep a single card.
 */
export const loadBoard = cache(_loadBoard);

function _loadBoard(userId: number, nowMs = Date.now()): BoardCard[] {
  const rows = loadDashboard({ userId });
  const track = trackRecords();

  const cards = rows.map(r => {
    const fare = r.fare as VerifiedFare | null;
    return composeCard({
      row: r.search as unknown as WatchRow,
      fare: fare
        ? {
            perAdultUsd: fare.price_per_adult_usd,
            partyTotalUsd: trustedPartyTotal(fare, r.search as unknown as WatchRow),
          }
        : null,
      history: r.history,
      thresholdPerAdult: r.threshold,
      verifiedAt: fare?.verified_at ?? fare?.polled_at ?? null,
      verifyOutcome: fare?.verify_outcome ?? null,
      track: track.get(routeFamily(r.search.origin, r.search.destination)) ?? null,
      nowMs,
    });
  });

  return sortBoard(cards);
}

/**
 * One card, for the watch detail screen. Returns null when it is not theirs.
 *
 * nowMs is deliberately NOT passed through to loadBoard: react cache keys on
 * arguments, and a fresh Date.now() on each call would defeat the cache and
 * reintroduce the double load it exists to prevent.
 */
/**
 * The provider's party total, but only when it still describes THIS party.
 *
 * total_price_usd was quoted for the pax the search had when the snapshot was
 * taken. If the traveller count has been edited since, that figure is for a
 * different party — and passing it through would mark a stale number as
 * `quoted`, which is the one flag the card uses to decide whether to say
 * "estimated". When it does not reconcile we return null and let
 * amountOnBasis derive one, which the card then labels as an estimate.
 */
function trustedPartyTotal(fare: FareRow, row: WatchRow): number | null {
  const total = fare.total_price_usd;
  const perAdult = fare.price_per_adult_usd;
  if (!(total > 0) || !(perAdult > 0)) return null;
  const weight = (row.adults ?? 0) + (row.children ?? 0) + (row.infants ?? 0) * 0.1;
  if (!(weight > 0)) return null;
  const implied = total / perAdult;
  // Generous tolerance: taxes and infant rules move this a little legitimately.
  return Math.abs(implied - weight) <= Math.max(0.35, weight * 0.15) ? total : null;
}

export function loadBoardCard(userId: number, watchId: number): BoardCard | null {
  return loadBoard(userId).find(c => c.id === watchId) ?? null;
}

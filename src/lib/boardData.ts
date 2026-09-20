import 'server-only';
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

export function loadBoard(userId: number, nowMs = Date.now()): BoardCard[] {
  const rows = loadDashboard({ userId });
  const track = trackRecords();

  const cards = rows.map(r => {
    const fare = r.fare as VerifiedFare | null;
    return composeCard({
      row: r.search as unknown as WatchRow,
      fare: fare
        ? { perAdultUsd: fare.price_per_adult_usd, partyTotalUsd: fare.total_price_usd ?? null }
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

/** One card, for the watch detail screen. Returns null when it is not theirs. */
export function loadBoardCard(userId: number, watchId: number, nowMs = Date.now()): BoardCard | null {
  return loadBoard(userId, nowMs).find(c => c.id === watchId) ?? null;
}

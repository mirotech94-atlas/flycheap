import 'server-only';
import { queries } from '@/lib/db';
import type { CandidateDeal } from './types';

// Read layer for the agents. Adapts the existing `queries` object (better-sqlite3)
// into the shapes the agents reason over. No LLM here — pure data.

/**
 * Candidate deals for the curator: cheapest fare per (origin,destination) from
 * the live best_deals_cache, enriched with a deterministic route median and the
 * percent-below-median so the model has a real "how good is this" signal.
 */
export function getCandidateDeals(limit = 40): CandidateDeal[] {
  const rows = queries.agentCandidateDeals(limit);
  return rows.map(r => {
    const median = queries.agentRouteMedian(r.origin, r.destination);
    const pct = median && median > 0
      ? Math.round(((median - r.per_adult_usd) / median) * 100)
      : null;
    return {
      origin: r.origin,
      destination: r.destination,
      outbound_date: r.outbound_date,
      return_date: r.return_date,
      per_adult_usd: r.per_adult_usd,
      party_total_usd: r.party_total_usd,
      trip_length_days: r.trip_length_days,
      outbound_transfers: r.outbound_transfers,
      return_transfers: r.return_transfers,
      provider: r.provider,
      route_median_usd: median,
      pct_below_median: pct,
    };
  });
}

/** 24h operational snapshot for the insights agent. */
export function getInsightsSnapshot() {
  return queries.agentInsightsSnapshot();
}

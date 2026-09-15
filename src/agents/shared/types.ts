// Shared types for the AI agent layer (phase 1).

export type CandidateDeal = {
  origin: string;
  destination: string;
  outbound_date: string;
  return_date: string;
  per_adult_usd: number;
  party_total_usd: number;
  trip_length_days: number;
  outbound_transfers: number;
  return_transfers: number;
  provider: string;
  // Deterministic baseline injected by data.ts so the model doesn't have to
  // guess how good a fare is.
  route_median_usd: number | null;
  pct_below_median: number | null;
};

export type CuratedPick = {
  origin: string;
  destination: string;
  outbound_date: string;
  return_date: string;
  per_adult_usd: number;
  party_total_usd: number | null;
  trip_length_days: number | null;
  headline: string;
  blurb: string;
  score: number;
  verified: boolean;
  verify_note: string | null;
};

export type CuratorResult = {
  runId: number;
  model: string;
  dryRun: boolean;
  picks: CuratedPick[];
  candidatesConsidered: number;
};

export type InsightsResult = {
  runId: number;
  model: string;
  dryRun: boolean;
  brief: string;
  emailed: boolean;
  emailTo: string | null;
};

export type RevenueResult = {
  runId: number;
  model: string;
  dryRun: boolean;
  /** Full plain-text brief. Every dollar figure in it was formatted in TS from a DB read. */
  brief: string;
  /** Why the agent alerted. Empty array = nothing material changed = no email sent. */
  triggers: string[];
  /** Things the agent refused to guess at (missing OWNER_EMAIL, stale balance, …). */
  unknowns: string[];
  emailed: boolean;
  emailTo: string | null;
  /** True when the model's prose failed the numeric guard and was discarded. */
  adviceGuardTripped: boolean;
};

import 'server-only';
import { queries } from '@/lib/db';
import type { CuratedPick } from './types';

// Write layer for the agents. Wraps the agent_runs / curated_picks queries so
// every agent records a durable, inspectable audit trail.

export function startRun(agent: string, model: string | null, dryRun: boolean): number {
  return queries.startAgentRun(agent, model, dryRun);
}

export function finishRun(id: number, opts: {
  ok: boolean; durationMs: number; summary?: string | null; output?: unknown; error?: string | null;
}): void {
  queries.finishAgentRun(id, {
    ok: opts.ok,
    durationMs: opts.durationMs,
    summary: opts.summary ?? null,
    outputJson: opts.output === undefined ? null : JSON.stringify(opts.output),
    error: opts.error ?? null,
  });
}

export function savePick(runId: number, p: CuratedPick): void {
  queries.insertCuratedPick({
    run_id: runId,
    origin: p.origin,
    destination: p.destination,
    outbound_date: p.outbound_date,
    return_date: p.return_date,
    per_adult_usd: p.per_adult_usd,
    party_total_usd: p.party_total_usd,
    trip_length_days: p.trip_length_days,
    headline: p.headline,
    blurb: p.blurb,
    score: p.score,
    verified: p.verified,
    verify_note: p.verify_note,
  });
}

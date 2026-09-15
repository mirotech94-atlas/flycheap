import 'server-only';
import { z } from 'zod';
import { MODELS, completeJSON, hasApiKey, isDryRun, pingModel } from '../shared/client';
import { getCandidateDeals } from '../shared/data';
import { startRun, finishRun, savePick } from '../shared/storage';
import { BRAND_VOICE, voiceFlags } from '../shared/voice';
import { verifyPick } from '../deal-verifier';
import type { CandidateDeal, CuratedPick, CuratorResult } from '../shared/types';

// Deal curator (phase 1). Every 6h: pull the cheapest live fares, ask Claude to
// select + score the best handful and write a short blurb for each in the brand
// voice, run each pick through the deterministic verifier, and save to
// curated_picks. In DRY_RUN nothing is broadcast — picks are saved for review.

const CuratorOutputSchema = z.object({
  picks: z.array(z.object({
    origin: z.string().length(3),
    destination: z.string().length(3),
    outbound_date: z.string(),
    return_date: z.string(),
    per_adult_usd: z.number(),
    headline: z.string().min(3).max(120),
    blurb: z.string().min(10).max(400),
    score: z.number().min(0).max(100),
  })).max(10),
});

function buildPrompt(candidates: CandidateDeal[]): string {
  // Hand the model only the fields it needs, including the deterministic
  // baseline so it scores on real signal not vibes.
  const compact = candidates.map(c => ({
    origin: c.origin,
    destination: c.destination,
    outbound_date: c.outbound_date,
    return_date: c.return_date,
    per_adult_usd: Math.round(c.per_adult_usd),
    trip_length_days: c.trip_length_days,
    stops_each_way: `${c.outbound_transfers}/${c.return_transfers}`,
    route_median_usd: c.route_median_usd ? Math.round(c.route_median_usd) : null,
    pct_below_median: c.pct_below_median,
  }));
  return [
    'Here are live cheapest round-trip fares from our tracker (one per route).',
    'Select the 5-8 BEST deals to broadcast. Favour fares well below their route median,',
    'reasonable trip lengths, and a diverse mix of destinations (do not pick five fares to the same place).',
    'For each pick: a punchy headline and a 1-2 sentence blurb explaining why it is a good deal.',
    'Score each 0-100 (100 = once-a-year fare). Use ONLY the numbers given — never invent prices, dates, or routes.',
    'Echo back origin, destination, outbound_date, return_date and per_adult_usd EXACTLY as given for each pick.',
    '',
    'CANDIDATES (JSON):',
    JSON.stringify(compact, null, 2),
  ].join('\n');
}

export async function runCurator(opts: { candidateLimit?: number } = {}): Promise<CuratorResult> {
  const dryRun = isDryRun();
  const model = MODELS.curator;

  if (!hasApiKey()) throw new Error('ANTHROPIC_API_KEY not set — curator cannot run');

  const candidates = getCandidateDeals(opts.candidateLimit ?? 40);
  const runId = startRun('curator', model, dryRun);
  const startMs = Date.now();

  try {
    if (candidates.length === 0) {
      finishRun(runId, { ok: true, durationMs: Date.now() - startMs, summary: 'no candidate deals in cache', output: { picks: [] } });
      return { runId, model, dryRun, picks: [], candidatesConsidered: 0 };
    }

    // Startup health check — confirm the model resolves before spending tokens.
    if (!(await pingModel(model))) throw new Error(`model ping failed: ${model}`);

    const out = await completeJSON({
      model,
      system: `${BRAND_VOICE}\n\nYou are FlyCheap's deal curator. You pick and describe the best flight deals.\nReturn an object: {"picks":[ ... ]}.`,
      user: buildPrompt(candidates),
      schema: CuratorOutputSchema,
      maxTokens: 2048,
      // Tolerate the model handing back a bare array or an alternately-keyed
      // wrapper instead of {picks:[...]}.
      normalize: (v) => {
        if (Array.isArray(v)) return { picks: v };
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          if (Array.isArray(o.picks)) return o;
          const firstArray = Object.values(o).find(Array.isArray);
          if (firstArray) return { picks: firstArray };
        }
        return v;
      },
    });

    const picks: CuratedPick[] = [];
    for (const p of out.picks) {
      const verdict = verifyPick(p, candidates);
      const match = candidates.find(c =>
        c.origin === p.origin && c.destination === p.destination &&
        c.outbound_date === p.outbound_date && c.return_date === p.return_date);
      const flags = voiceFlags(`${p.headline} ${p.blurb}`);
      picks.push({
        origin: p.origin,
        destination: p.destination,
        outbound_date: p.outbound_date,
        return_date: p.return_date,
        per_adult_usd: p.per_adult_usd,
        party_total_usd: match?.party_total_usd ?? null,
        trip_length_days: match?.trip_length_days ?? null,
        headline: p.headline,
        blurb: p.blurb,
        score: p.score,
        verified: verdict.verified,
        verify_note: flags.length ? `${verdict.note}; voice: ${flags.join(', ')}` : verdict.note,
      });
    }

    // Save every pick (verified flag recorded per-row). DRY_RUN means we do not
    // broadcast anywhere — saving for review IS the phase-1 deliverable.
    for (const p of picks) savePick(runId, p);

    const verifiedCount = picks.filter(p => p.verified).length;
    const summary = `${picks.length} picks (${verifiedCount} verified) from ${candidates.length} candidates · DRY_RUN=${dryRun}`;
    finishRun(runId, { ok: true, durationMs: Date.now() - startMs, summary, output: { picks } });

    return { runId, model, dryRun, picks, candidatesConsidered: candidates.length };
  } catch (e) {
    finishRun(runId, { ok: false, durationMs: Date.now() - startMs, error: (e as Error).message });
    throw e;
  }
}

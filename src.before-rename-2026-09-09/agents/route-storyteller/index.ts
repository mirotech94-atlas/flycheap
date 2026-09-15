import 'server-only';
import { z } from 'zod';
import { queries } from '@/lib/db';
import { MODELS, completeJSON, hasApiKey, pingModel } from '../shared/client';
import { startRun, finishRun } from '../shared/storage';
import { BRAND_VOICE } from '../shared/voice';
import { airportByCode } from '@/lib/airports';

// Route storyteller (phase 3). Generates the AI sections of a /routes/[slug]
// landing page — "When to fly" + FAQs — grounded in the route's real cached
// fare DNA. Live stats stay live on the page; only the prose is stored.
//
// Hard guard: the model invented numbers twice in earlier agents (score-as-%,
// fabricated discounts). Here we extract every dollar amount and percentage
// from the generated prose and reject the run if any falls outside what the
// real DNA supports. Fabricated numbers never reach the page.

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const StoryOutput = z.object({
  when_to_fly: z.string().min(40),
  faqs: z.array(z.object({ q: z.string().min(5), a: z.string().min(5) })).min(3).max(6),
  // Generous bounds — we truncate to SEO limits (70/160) on save rather than
  // failing the run over a few extra characters.
  meta_title: z.string().max(200).optional(),
  meta_desc: z.string().max(400).optional(),
});

const trunc = (s: string | undefined, n: number): string | null =>
  s == null ? null : (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

export type RouteDNA = {
  origin: string; destination: string;
  cheapDay: string | null; cheapHour: number | null;
  bestTripDays: number | null;
  medianUsd: number | null; floorUsd: number | null;
  samples: number;
};

function mode<T extends string | number>(values: T[]): T | null {
  if (!values.length) return null;
  const m = new Map<T, number>(); let best = values[0]; let bc = 0;
  for (const v of values) { const c = (m.get(v) ?? 0) + 1; m.set(v, c); if (c > bc) { bc = c; best = v; } }
  return best;
}

export function computeRouteDNA(origin: string, destination: string): RouteDNA {
  const rows = queries.bestDealsRouteStats(origin, destination);
  const prices = rows.map(r => r.per_adult_usd).filter(n => n > 0).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const floor = prices.length ? prices[0] : null;
  const dowMode = mode(rows.map(r => r.outbound_dow));
  return {
    origin, destination,
    cheapDay: dowMode != null ? DOW[dowMode] ?? null : null,
    cheapHour: mode(rows.map(r => r.outbound_hour)),
    bestTripDays: mode(rows.map(r => r.trip_length_days)),
    medianUsd: median != null ? Math.round(median) : null,
    floorUsd: floor != null ? Math.round(floor) : null,
    samples: rows.length,
  };
}

/**
 * Reject prose that cites numbers the DNA doesn't support. Returns a list of
 * violations (empty = clean).
 *  - Dollar amounts must fall within [floor-5, median+5].
 *  - Percentages must not exceed the max real discount (median→floor) + 2pts.
 */
export function numberViolations(text: string, dna: RouteDNA): string[] {
  const out: string[] = [];
  if (dna.floorUsd != null && dna.medianUsd != null) {
    const lo = dna.floorUsd - 5;
    const hi = dna.medianUsd + 5;
    for (const m of text.matchAll(/\$\s?([0-9][0-9,]{1,6})/g)) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && (n < lo || n > hi)) out.push(`$${n} outside [$${lo},$${hi}]`);
    }
    const maxPct = Math.max(0, Math.round(((dna.medianUsd - dna.floorUsd) / dna.medianUsd) * 100)) + 2;
    for (const m of text.matchAll(/([0-9]{1,3})\s?%/g)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxPct) out.push(`${n}% exceeds max real discount ${maxPct}%`);
    }
  }
  return out;
}

function buildPrompt(dna: RouteDNA): string {
  const oA = airportByCode(dna.origin);
  const dA = airportByCode(dna.destination);
  return [
    `Write the "When to fly" section (2-3 short paragraphs) and 4 FAQs for this flight route page.`,
    `ROUTE: ${dna.origin} (${oA?.city ?? dna.origin}) → ${dna.destination} (${dA?.city ?? dna.destination})`,
    ``,
    `DATA — every number you write MUST come from here. Do not invent prices, percentages, or stats:`,
    `- Cheapest day of week to depart: ${dna.cheapDay ?? 'unknown'}`,
    `- Most common cheap departure hour: ${dna.cheapHour != null ? `${dna.cheapHour}:00 local` : 'unknown'}`,
    `- Best trip length: ${dna.bestTripDays != null ? `${dna.bestTripDays} days` : 'unknown'}`,
    `- Median round-trip per adult: ${dna.medianUsd != null ? `$${dna.medianUsd}` : 'unknown'}`,
    `- Cheapest seen in cache: ${dna.floorUsd != null ? `$${dna.floorUsd}` : 'unknown'}`,
    `- Sample size: ${dna.samples} cached fares`,
    ``,
    `Rules: if a number isn't in the data above, don't state it. No prices or percentages beyond what's given.`,
    `If something is "unknown", write around it — don't guess. Output JSON: {when_to_fly, faqs:[{q,a}], meta_title, meta_desc}.`,
  ].join('\n');
}

export async function runRouteStoryteller(opts: { routes?: Array<{ origin: string; destination: string }>; limit?: number } = {}): Promise<{
  runId: number; model: string;
  results: Array<{ origin: string; destination: string; saved: boolean; note: string }>;
}> {
  const model = MODELS.curator; // sonnet
  if (!hasApiKey()) throw new Error('ANTHROPIC_API_KEY not set — storyteller cannot run');

  const targets = opts.routes ?? queries.topRoutesByCache(opts.limit ?? 10).map(r => ({ origin: r.origin, destination: r.destination }));
  const runId = startRun('route-storyteller', model, false);
  const startMs = Date.now();
  const results: Array<{ origin: string; destination: string; saved: boolean; note: string }> = [];

  try {
    let pinged = false;
    for (const t of targets) {
      try {
        const dna = computeRouteDNA(t.origin, t.destination);
        if (dna.samples < 3 || dna.medianUsd == null) {
          results.push({ ...t, saved: false, note: `insufficient DNA (${dna.samples} samples) — skipped` });
          continue;
        }
        if (!pinged) { if (!(await pingModel(model))) throw new Error(`model ping failed: ${model}`); pinged = true; }

        const out = await completeJSON({
          model,
          system: `${BRAND_VOICE}\n\nYou write factual, data-grounded route guides. Never invent numbers.`,
          user: buildPrompt(dna),
          schema: StoryOutput,
          maxTokens: 1400,
        });

        const allText = `${out.when_to_fly}\n${out.faqs.map(f => `${f.q} ${f.a}`).join('\n')}`;
        const violations = numberViolations(allText, dna);
        if (violations.length) {
          results.push({ ...t, saved: false, note: `rejected — fabricated numbers: ${violations.join('; ')}` });
          continue;
        }

        queries.upsertRouteContent({
          origin: t.origin, destination: t.destination,
          when_to_fly_md: out.when_to_fly,
          faqs_json: JSON.stringify(out.faqs),
          meta_title: trunc(out.meta_title, 70),
          meta_desc: trunc(out.meta_desc, 160),
          model,
        });
        results.push({ ...t, saved: true, note: `saved · ${out.faqs.length} FAQs` });
      } catch (err) {
        // One bad route must not abort the batch.
        results.push({ ...t, saved: false, note: `error: ${(err as Error).message.slice(0, 120)}` });
      }
    }

    const saved = results.filter(r => r.saved).length;
    finishRun(runId, { ok: true, durationMs: Date.now() - startMs, summary: `${saved}/${results.length} routes saved`, output: { results } });
    return { runId, model, results };
  } catch (e) {
    finishRun(runId, { ok: false, durationMs: Date.now() - startMs, error: (e as Error).message });
    throw e;
  }
}

import 'server-only';

// Thin wrapper over the Anthropic SDK shared by every agent. Mirrors the
// proven pattern in src/lib/routeIntel.ts (dynamic import, dated model IDs).
//
// Pinned, dated model snapshots for reproducibility — curator/insights output
// should not silently drift when an alias re-points. All three verified live
// (HTTP 200) against the prod key on 2026-05-25.
export const MODELS = {
  curator:  'claude-sonnet-4-5-20250929',
  insights: 'claude-sonnet-4-5-20250929',
  verifier: 'claude-haiku-4-5-20251001',
} as const;

export type AgentModel = (typeof MODELS)[keyof typeof MODELS];

export function hasApiKey(): boolean {
  return Boolean((process.env.ANTHROPIC_API_KEY ?? '').trim());
}

export function isDryRun(): boolean {
  // Default to DRY RUN unless explicitly disabled — fail safe, never broadcast
  // by accident.
  return (process.env.AGENT_DRY_RUN ?? 'true').toLowerCase() !== 'false';
}

async function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey });
}

/**
 * Startup health check — confirm the configured model actually resolves before
 * an agent does real work. Cheap 1-token ping. Returns true/false, never throws.
 */
export async function pingModel(model: AgentModel): Promise<boolean> {
  try {
    const client = await getClient();
    await client.messages.create({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return true;
  } catch (e) {
    console.error(`[agents] model ping failed for ${model}:`, (e as Error).message);
    return false;
  }
}

/** Plain text completion. */
export async function complete(opts: {
  model: AgentModel; system: string; user: string; maxTokens?: number;
}): Promise<string> {
  const client = await getClient();
  const res = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });
  return res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
}

/**
 * JSON completion validated against a Zod schema. Strips markdown fences,
 * parses, and validates. Throws on invalid output so the caller's run is
 * recorded as a failure rather than silently saving garbage.
 */
export async function completeJSON<T>(opts: {
  model: AgentModel;
  system: string;
  user: string;
  schema: { parse: (v: unknown) => T };
  maxTokens?: number;
  // Optional shape-coercion applied before schema validation (e.g. unwrap a
  // bare array or an alternately-keyed object the model returned).
  normalize?: (v: unknown) => unknown;
}): Promise<T> {
  const raw = await complete({
    model: opts.model,
    system: opts.system + '\n\nReturn ONLY valid JSON. No prose, no markdown fences.',
    user: opts.user,
    maxTokens: opts.maxTokens ?? 2048,
  });
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`agent returned non-JSON: ${cleaned.slice(0, 300)}`);
  }
  const shaped = opts.normalize ? opts.normalize(parsed) : parsed;
  try {
    return opts.schema.parse(shaped);
  } catch (e) {
    throw new Error(`agent output failed schema: ${(e as Error).message} · raw: ${cleaned.slice(0, 300)}`);
  }
}

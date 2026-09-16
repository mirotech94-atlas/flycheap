import 'server-only';
import { llmProvider, groqModel } from '@/lib/llmProvider';
import { groqChat } from '@/lib/groqChat';

// Thin wrapper shared by every content agent. Groq is the primary provider;
// Anthropic is kept only as a fallback (GROQ_API_KEY unset, or an explicit
// LLM_PROVIDER=anthropic override) — see src/lib/llmProvider.ts.
//
// Pinned, dated Anthropic model snapshots for reproducibility — curator/
// insights output should not silently drift when an alias re-points. All
// three verified live (HTTP 200) against the prod key on 2026-05-25. Groq
// tiers ('smart' / 'fast') come from src/lib/llmProvider.ts.
const ANTHROPIC_MODELS = {
  curator:  'claude-sonnet-4-5-20250929',
  insights: 'claude-sonnet-4-5-20250929',
  verifier: 'claude-haiku-4-5-20251001',
  // Revenue agent only ever writes the qualitative "how to earn more" prose —
  // every dollar figure it reports is formatted in TypeScript from a DB read,
  // never by the model. See src/agents/revenue/index.ts.
  revenue:  'claude-sonnet-4-5-20250929',
} as const;

type Role = keyof typeof ANTHROPIC_MODELS;

// storyteller and social-poster reuse MODELS.curator; email-digest reuses
// MODELS.insights (see those agents' imports) — so these four keys are the
// full set of tiers actually needed.
const ROLE_TIER: Record<Role, 'smart' | 'fast'> = {
  curator: 'smart',
  insights: 'smart',
  revenue: 'smart',
  verifier: 'fast',
};

function modelForRole(role: Role): string {
  return llmProvider() === 'groq' ? groqModel(ROLE_TIER[role]) : ANTHROPIC_MODELS[role];
}

export const MODELS = {
  curator: modelForRole('curator'),
  insights: modelForRole('insights'),
  verifier: modelForRole('verifier'),
  revenue: modelForRole('revenue'),
} as const;

export type AgentModel = string;

export function hasApiKey(): boolean {
  return llmProvider() !== 'none';
}

export function isDryRun(): boolean {
  // Default to DRY RUN unless explicitly disabled — fail safe, never broadcast
  // by accident.
  return (process.env.AGENT_DRY_RUN ?? 'true').toLowerCase() !== 'false';
}

async function getAnthropicClient() {
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
    if (llmProvider() === 'groq') {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error('GROQ_API_KEY not set');
      await groqChat({ apiKey, model, system: 'ping', messages: [{ role: 'user', content: 'ping' }], maxTokens: 1 });
    } else {
      const client = await getAnthropicClient();
      await client.messages.create({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
    }
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
  if (llmProvider() === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not set');
    return (await groqChat({
      apiKey,
      model: opts.model,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      maxTokens: opts.maxTokens ?? 1024,
    })).trim();
  }
  const client = await getAnthropicClient();
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

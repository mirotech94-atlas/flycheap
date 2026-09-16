import 'server-only';

/**
 * Multi-provider AI failover registry.
 *
 * Every provider here speaks the OpenAI-compatible `/chat/completions` shape,
 * so one loop can drive all of them — only the base URL, key and model change.
 * Providers are tried in `order` (lowest first): free tiers before paid, local
 * last. A provider only enters the live chain when its key/config is present
 * (`auth()` returns non-null), so unconfigured providers are dormant entries,
 * not errors — add the env var and they light up.
 *
 * Groq's daily token cap is PER MODEL, so listing two Groq models gives a real
 * in-provider fallback with a second daily budget before any paid credit is
 * spent. Model lists reflect what each account actually has (verified for Groq;
 * the rest use each provider's documented ids).
 *
 * `mock` and the `n8n webhook` from the reference design are intentionally
 * omitted — they are dev/demo sinks, "not in failover".
 */

export type AiProvider = {
  id: string;
  label: string;
  group: string;
  order: number;
  baseUrl: () => string;
  models: string[];
  /** How many of this provider's models the failover chain may use (default maxPerProvider). */
  maxModels?: number;
  /** Resolves credentials from env; null when the provider is not configured. */
  auth: () => { apiKey: string; headers?: Record<string, string> } | null;
  /** One line telling the owner how to enable a dormant provider. */
  note?: string;
};

const env = (k: string): string | null => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : null;
};

/**
 * Every CHAT-CAPABLE model on the Groq account, in fallback order (most capable
 * + most tool-reliable first). Groq's token cap is PER MODEL PER DAY, so each
 * entry is a fresh daily budget before any paid provider is touched.
 *
 * Deliberately EXCLUDED: meta-llama/llama-prompt-guard-2-22m / -86m (prompt-
 * injection classifiers) and openai/gpt-oss-safeguard-20b (moderation) — those
 * are guard models, not chat models, so they can't answer the concierge or
 * agents. Add them only to a dedicated moderation path, never to this chain.
 */
export const GROQ_CHAT_MODELS = [
  'openai/gpt-oss-120b',   // best tool-use · 200K tok/day
  'openai/gpt-oss-20b',    // fast tool-use · 200K tok/day
  'qwen/qwen3.8-27b',      // capable, supports tools · 200K tok/day
  'groq/compound',         // agentic · no daily token cap (250 req/day)
  'groq/compound-mini',    // agentic, lighter · no daily token cap (250 req/day)
  'allam-2-7b',            // small last-resort · 500K tok/day
];

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'groq', label: 'Groq', group: 'Groq (free)', order: 0,
    baseUrl: () => 'https://api.groq.com/openai/v1',
    // All chat-capable models on this account; each has its own daily bucket.
    models: GROQ_CHAT_MODELS,
    maxModels: GROQ_CHAT_MODELS.length,
    auth: () => { const k = env('GROQ_API_KEY'); return k ? { apiKey: k } : null; },
  },
  {
    id: 'cloudflare', label: 'Cloudflare Workers AI', group: 'Cloudflare Workers AI', order: 1,
    baseUrl: () => `https://api.cloudflare.com/client/v4/accounts/${env('CF_ACCOUNT_ID') ?? env('CLOUDFLARE_ACCOUNT_ID') ?? 'ACCOUNT_ID'}/ai/v1`,
    models: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
    auth: () => {
      const k = env('CF_API_TOKEN') ?? env('CLOUDFLARE_API_TOKEN');
      const a = env('CF_ACCOUNT_ID') ?? env('CLOUDFLARE_ACCOUNT_ID');
      return k && a ? { apiKey: k } : null;
    },
    note: 'Set CF_ACCOUNT_ID + CF_API_TOKEN (free Workers AI).',
  },
  {
    id: 'openrouter', label: 'OpenRouter', group: 'OpenRouter', order: 2,
    baseUrl: () => 'https://openrouter.ai/api/v1',
    // Verified working on this account. NOTE: OpenRouter's ':free' variants are
    // not available here (they 404 as "unavailable for free"), so minimax-m3 is
    // the paid model — cheap, and only reached when Groq is exhausted.
    models: ['minimax/minimax-m3'],
    auth: () => {
      const k = env('OPENROUTER_API_KEY');
      return k ? { apiKey: k, headers: { 'HTTP-Referer': 'https://flycheap.live', 'X-Title': 'FlyCheap' } } : null;
    },
    note: 'Set OPENROUTER_API_KEY. Free ":free" models are unavailable on this account; minimax-m3 draws paid credit.',
  },
  {
    id: 'gemini', label: 'Google Gemini', group: 'Google Gemini', order: 3,
    baseUrl: () => 'https://generativelanguage.googleapis.com/v1beta/openai',
    // Stable aliases (verified): older pinned ids like gemini-2.5-flash 404 for
    // new API users, so use the "-latest" aliases that always resolve.
    models: ['gemini-flash-latest', 'gemini-flash-lite-latest'],
    auth: () => { const k = env('GEMINI_API_KEY') ?? env('GOOGLE_API_KEY'); return k ? { apiKey: k } : null; },
    note: 'Set GEMINI_API_KEY (free tier).',
  },
  {
    id: 'anthropic', label: 'Anthropic Claude', group: 'Anthropic Claude', order: 4,
    baseUrl: () => 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'],
    auth: () => { const k = env('ANTHROPIC_API_KEY'); return k ? { apiKey: k } : null; },
    note: 'Configured, but needs a positive Anthropic credit balance to answer.',
  },
  {
    id: 'ollama', label: 'Ollama (self-hosted)', group: 'Ollama', order: 13,
    baseUrl: () => `${env('OLLAMA_BASE_URL') ?? 'http://127.0.0.1:11434'}/v1`,
    models: ['llama3.2'],
    // Only enters the chain when explicitly pointed at a running Ollama.
    auth: () => { const b = env('OLLAMA_BASE_URL'); return b ? { apiKey: 'ollama' } : null; },
    note: 'Set OLLAMA_BASE_URL to a running Ollama server.',
  },
];

export type ProviderAttempt = {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
};

/**
 * Ordered (provider, model) attempts that are actually configured right now.
 * `maxPerProvider` and `maxTotal` bound the chain length — important because a
 * failover attempt replays the whole request, so the chain should be short.
 */
export function buildProviderChain(opts?: { maxPerProvider?: number; maxTotal?: number }): ProviderAttempt[] {
  const maxPer = opts?.maxPerProvider ?? 2;
  const maxTotal = opts?.maxTotal ?? 12;
  const chain: ProviderAttempt[] = [];
  for (const p of [...AI_PROVIDERS].sort((a, b) => a.order - b.order)) {
    const a = p.auth();
    if (!a) continue;
    const base = p.baseUrl();
    for (const model of p.models.slice(0, p.maxModels ?? maxPer)) {
      chain.push({ provider: `${p.id}:${model.split('/').pop()}`, model, baseUrl: base, apiKey: a.apiKey, headers: a.headers });
      if (chain.length >= maxTotal) return chain;
    }
  }
  return chain;
}

/** Every provider with a `configured` flag and its models — for a status view
 * or a future model picker. Never exposes key material. */
export function providerCatalog() {
  return AI_PROVIDERS.map(p => ({
    id: p.id, label: p.label, group: p.group, order: p.order,
    models: p.models, configured: !!p.auth(), note: p.note ?? null,
  }));
}

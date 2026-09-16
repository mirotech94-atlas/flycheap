import 'server-only';

export type GroqChatMsg = { role: 'user' | 'assistant'; content: string };

// Groq's free tier is 8,000 tokens/min/model. A 429 response body includes a
// human-readable retry hint like "Please try again in 35.115s" — parse that
// (falling back to a conservative default), floor it at 20s (a short hint
// still lands inside the same minute window and re-triggers immediately),
// cap it at 60s so a bad server-supplied value can't stall the caller
// indefinitely, sleep, and retry up to 2 times (3 attempts total) before
// giving up. The same retry budget also covers the transient
// json_validate_failed 400 the gpt-oss models throw when strict-JSON output
// comes back empty. Mirrors src/lib/ops/groqClient.ts.
const MIN_RETRY_SECONDS = 20;
const MAX_RETRY_SECONDS = 60;
const MAX_RETRIES = 2;

function parseRetrySeconds(body: string): number {
  const m = body.match(/try again in ([\d.]+)s/);
  const parsed = m ? parseFloat(m[1]) : NaN;
  const raw = Number.isFinite(parsed) && parsed >= 0 ? parsed : MIN_RETRY_SECONDS;
  return Math.max(MIN_RETRY_SECONDS, Math.min(MAX_RETRY_SECONDS, raw));
}

// A per-DAY (TPD) 429 is different from a per-minute (TPM) one: the daily
// free-tier cap won't clear for hours, so retrying inside this call just
// stalls the caller for a minute or two before failing anyway. Detect it and
// fail fast with a clear message instead.
export function isDailyLimit(body: string): boolean {
  return /per day|tokens per day|\bTPD\b/i.test(body);
}

/**
 * Minimal Groq (OpenAI-compatible) chat-completions call, no tools — used by
 * the Slack support concierge, which only ever needs plain text back.
 */
export async function groqChat(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: GroqChatMsg[];
  maxTokens: number;
  // When true, ask Groq for strict JSON output (OpenAI-compatible
  // response_format). The caller MUST also mention "JSON" in the prompt or
  // Groq rejects the request; completeJSON already does. Reduces (does not
  // guarantee) non-JSON replies from the gpt-oss models.
  json?: boolean;
  // reasoning_effort for the gpt-oss reasoning models. Their hidden reasoning
  // tokens count against max_tokens; with a small budget the reasoning can
  // eat the whole allowance and leave the content empty (Groq then 400s a
  // json request as json_validate_failed with an empty failed_generation).
  // 'low' shrinks that reasoning so short structured/marketing outputs fit,
  // and conserves the free-tier tokens-per-minute budget. Only sent for
  // gpt-oss models (Groq rejects the field on models that don't support it).
  reasoningEffort?: 'low' | 'medium' | 'high';
  // Groq's daily (TPD) token cap is PER MODEL, so when the primary model's
  // daily bucket is exhausted a different Groq model still answers. On a
  // daily-cap 429 we switch to this model once (its own bucket) instead of
  // failing. Defaults to the fast gpt-oss model.
  fallbackModel?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<string> {
  const baseUrl = opts.baseUrl ?? 'https://api.groq.com/openai/v1';
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const fallbackModel = opts.fallbackModel ?? 'openai/gpt-oss-20b';

  const doFetch = (model: string) => fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      messages: [{ role: 'system', content: opts.system }, ...opts.messages],
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      ...(opts.reasoningEffort && /gpt-oss/.test(model)
        ? { reasoning_effort: opts.reasoningEffort }
        : {}),
    }),
  });

  let model = opts.model;
  let res = await doFetch(model);
  let lastBody = '';
  for (let attempt = 0; !res.ok && attempt < MAX_RETRIES; attempt++) {
    lastBody = await res.text().catch(() => '');
    if (res.status === 429) {
      // A daily-cap 429 is per-model: switch to the fallback model's own
      // daily bucket once. If we're already on it, the whole account is dry.
      if (isDailyLimit(lastBody)) {
        if (model === fallbackModel) throw new Error(`Groq daily token limit reached on all models. ${lastBody.slice(0, 160)}`);
        model = fallbackModel;
      } else {
        // Per-minute rate limit: honour the server's retry hint.
        await sleep(parseRetrySeconds(lastBody) * 1000);
      }
    } else if (res.status === 400 && /json_validate_failed/.test(lastBody)) {
      // Transient: the gpt-oss reasoning models occasionally emit an empty
      // final message in strict-JSON mode (all budget spent in the hidden
      // reasoning channel), which Groq rejects as json_validate_failed with
      // an empty failed_generation. A plain re-run almost always succeeds, so
      // retry after a short pause rather than failing the whole agent run.
      await sleep(500);
    } else {
      // Non-retryable error: surface it immediately.
      throw new Error(`Groq ${res.status}: ${lastBody.slice(0, 300)}`);
    }
    res = await doFetch(model);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => lastBody);
    throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`);
  }
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

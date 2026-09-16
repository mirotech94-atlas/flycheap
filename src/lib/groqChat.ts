import 'server-only';

export type GroqChatMsg = { role: 'user' | 'assistant'; content: string };

// Groq's free tier is 8,000 tokens/min/model. A 429 response body includes a
// human-readable retry hint like "Please try again in 35.115s" — parse that
// (falling back to a conservative default), floor it at 20s (a short hint
// still lands inside the same minute window and re-triggers immediately),
// cap it at 60s so a bad server-supplied value can't stall the caller
// indefinitely, sleep, and retry up to 2 times (3 attempts total) before
// giving up. Mirrors src/lib/ops/groqClient.ts.
const MIN_RETRY_SECONDS = 20;
const MAX_RETRY_SECONDS = 60;
const MAX_RETRIES = 2;

function parseRetrySeconds(body: string): number {
  const m = body.match(/try again in ([\d.]+)s/);
  const parsed = m ? parseFloat(m[1]) : NaN;
  const raw = Number.isFinite(parsed) && parsed >= 0 ? parsed : MIN_RETRY_SECONDS;
  return Math.max(MIN_RETRY_SECONDS, Math.min(MAX_RETRY_SECONDS, raw));
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
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<string> {
  const baseUrl = opts.baseUrl ?? 'https://api.groq.com/openai/v1';
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));

  const doFetch = () => fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: [{ role: 'system', content: opts.system }, ...opts.messages],
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  let res = await doFetch();
  for (let attempt = 0; res.status === 429 && attempt < MAX_RETRIES; attempt++) {
    const retryText = await res.text().catch(() => '');
    await sleep(parseRetrySeconds(retryText) * 1000);
    res = await doFetch();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`);
  }
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

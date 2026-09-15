import 'server-only';

export type GroqChatMsg = { role: 'user' | 'assistant'; content: string };

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
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const baseUrl = opts.baseUrl ?? 'https://api.groq.com/openai/v1';
  const fetchImpl = opts.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: [{ role: 'system', content: opts.system }, ...opts.messages],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`);
  }
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

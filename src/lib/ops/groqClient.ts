import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import type { MessagesClient } from './agent';

/**
 * Adapts Groq's OpenAI-compatible chat-completions API to the Anthropic
 * `MessagesClient` shape the ops agent (src/lib/ops/agent.ts) is written
 * against, so the agent's tool loop can run unmodified against either
 * provider. Only the subset of the Anthropic wire format the agent actually
 * uses is translated: string/array message content, text + tool_use content
 * blocks, tool_result blocks, and Anthropic `Tool[]` (input_schema).
 */

type OAToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type OAMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OAToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

function textOf(blocks: Array<{ type: string; text?: string }>): string {
  return blocks.filter(b => b.type === 'text' && typeof b.text === 'string').map(b => b.text as string).join('\n');
}

function buildOAMessages(params: Anthropic.MessageCreateParamsNonStreaming): OAMessage[] {
  const out: OAMessage[] = [];
  if (params.system) {
    out.push({ role: 'system', content: typeof params.system === 'string' ? params.system : String(params.system) });
  }
  for (const m of params.messages as Anthropic.MessageParam[]) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks = m.content as unknown as Array<Record<string, unknown>>;
    if (m.role === 'user') {
      // A user turn's array content is either tool_result blocks (the agent's
      // reply to prior tool_use calls) or plain text blocks. Each tool_result
      // becomes its own 'tool' message; any accompanying text becomes a
      // trailing user message.
      const toolResults = blocks.filter(b => b.type === 'tool_result');
      const textBlocks = blocks.filter(b => b.type === 'text');
      for (const tr of toolResults) {
        const content = tr.content;
        const text = typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? textOf(content as Array<{ type: string; text?: string }>)
            : '';
        out.push({ role: 'tool', tool_call_id: String(tr.tool_use_id), content: text });
      }
      if (textBlocks.length) {
        out.push({ role: 'user', content: textOf(textBlocks as Array<{ type: string; text?: string }>) });
      }
    } else {
      // assistant turn: join text blocks; map tool_use blocks to tool_calls.
      const text = textOf(blocks as Array<{ type: string; text?: string }>);
      const toolUses = blocks.filter(b => b.type === 'tool_use');
      const tool_calls: OAToolCall[] = toolUses.map(tu => ({
        id: String(tu.id),
        type: 'function',
        function: { name: String(tu.name), arguments: JSON.stringify(tu.input ?? {}) },
      }));
      out.push({
        role: 'assistant',
        content: text || null,
        ...(tool_calls.length ? { tool_calls } : {}),
      });
    }
  }
  return out;
}

function buildOATools(tools: Anthropic.Tool[] | undefined) {
  if (!tools || !tools.length) return undefined;
  return tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

// Groq's free tier is 8,000 tokens/min/model. A 429 response body includes a
// human-readable retry hint like "Please try again in 35.115s" — parse that
// (falling back to a conservative default), floor it at 20s (a short hint
// still lands inside the same minute window and re-triggers immediately),
// cap it at 60s so a bad server-supplied value can't stall the caller
// indefinitely, sleep, and retry up to 2 times (3 attempts total) before
// giving up.
const MIN_RETRY_SECONDS = 20;
const MAX_RETRY_SECONDS = 60;
const MAX_RETRIES = 2;

function parseRetrySeconds(body: string): number {
  const m = body.match(/try again in ([\d.]+)s/);
  const parsed = m ? parseFloat(m[1]) : NaN;
  const raw = Number.isFinite(parsed) && parsed >= 0 ? parsed : MIN_RETRY_SECONDS;
  return Math.max(MIN_RETRY_SECONDS, Math.min(MAX_RETRY_SECONDS, raw));
}

export function createGroqMessagesClient(opts: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  // Free-tier per-minute token caps make a 413 (request too large) an
  // unretryable-as-is error — the only recourse is a smaller model with a
  // smaller cap-relative footprint. Defaults to the fast model.
  fallbackModel?: string;
}): MessagesClient {
  const baseUrl = opts.baseUrl ?? 'https://api.groq.com/openai/v1';
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const fallbackModel = opts.fallbackModel ?? 'openai/gpt-oss-20b';

  return {
    messages: {
      async create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
        const messages = buildOAMessages(params);
        const oaTools = buildOATools(params.tools as Anthropic.Tool[] | undefined);
        const buildBody = (model: string): Record<string, unknown> => {
          const body: Record<string, unknown> = { model, max_tokens: params.max_tokens, messages };
          if (oaTools) {
            body.tools = oaTools;
            body.tool_choice = 'auto';
          }
          return body;
        };

        const doFetch = (model: string) => fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildBody(model)),
        });

        let model = opts.model;
        let res = await doFetch(model);
        for (let attempt = 0; res.status === 429 && attempt < MAX_RETRIES; attempt++) {
          const retryText = await res.text().catch(() => '');
          await sleep(parseRetrySeconds(retryText) * 1000);
          res = await doFetch(model);
        }
        if (res.status === 413) {
          if (model === fallbackModel) {
            throw new Error('Groq 413 (request too large even after trim)');
          }
          model = fallbackModel;
          res = await doFetch(model);
          if (res.status === 413) {
            throw new Error('Groq 413 (request too large even after trim)');
          }
        }
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`);
        }
        const j = await res.json();
        const choice = j.choices?.[0];
        const msg = choice?.message ?? {};

        const content: Array<Record<string, unknown>> = [];
        const text: string = typeof msg.content === 'string' ? msg.content : '';
        if (text) content.push({ type: 'text', text, citations: null });

        const toolCalls = (msg.tool_calls ?? []) as Array<{ id: string; function: { name: string; arguments: string } }>;
        for (const c of toolCalls) {
          let input: unknown = {};
          try { input = JSON.parse(c.function.arguments || '{}'); } catch { input = {}; }
          content.push({
            type: 'tool_use',
            id: c.id,
            name: c.function.name,
            input,
            caller: { type: 'direct' },
          });
        }

        const stop_reason = toolCalls.length ? 'tool_use' : 'end_turn';
        const usage = j.usage ?? {};

        const message = {
          id: j.id ?? 'groq-message',
          type: 'message',
          role: 'assistant',
          model,
          content,
          stop_reason,
          stop_sequence: null,
          container: null,
          usage: {
            input_tokens: usage.prompt_tokens ?? 0,
            output_tokens: usage.completion_tokens ?? 0,
            cache_creation: null,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            server_tool_use: null,
            service_tier: null,
          },
        };
        return message as unknown as Anthropic.Message;
      },
    },
  };
}

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { CHAT_SYSTEM_PROMPT, TOOLS, CHAT_MUTATING_TOOLS, runTool } from '@/lib/chatTools';
import { buildFlightHudPayload } from '@/lib/flightHud';
import { getCurrentUser } from '@/lib/auth';
import { llmProvider } from '@/lib/llmProvider';

export const maxDuration = 60;

const Schema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(1).max(40),
});

const MAX_ITERATIONS = 6;

type ChatMsg = { role: 'user' | 'assistant'; content: string };
type ToolCallLog = Array<{ name: string; input: unknown; result_preview: string }>;
type ToolResultLog = Array<{ name: string; input: unknown; content: string }>;
type LoopResult =
  | { ok: true; reply: string; turns: number; provider: string }
  | { ok: false; error: string };

/* ─── Anthropic loop (primary) ─── */
async function runAnthropicLoop(
  userMessages: ChatMsg[], toolCalls: ToolCallLog, toolResults: ToolResultLog,
): Promise<LoopResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY not set' };
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = userMessages.map(m => ({ role: m.role, content: m.content }));

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: process.env.CHAT_MODEL_ANTHROPIC || 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: CHAT_SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });
    } catch (e) {
      const msg = e instanceof Anthropic.APIError ? `Anthropic API ${e.status}: ${e.message}` : (e as Error).message;
      return { ok: false, error: msg };
    }

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens' || response.stop_reason === 'refusal') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text).join('\n');
      return { ok: true, reply: text, turns: i + 1, provider: 'anthropic' };
    }
    if (response.stop_reason !== 'tool_use') {
      return { ok: false, error: `Unexpected stop_reason: ${response.stop_reason}` };
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) {
      const r = await runTool(t.name, (t.input ?? {}) as Record<string, unknown>);
      toolCalls.push({ name: t.name, input: t.input, result_preview: r.content.slice(0, 200) + (r.content.length > 200 ? '…' : '') });
      toolResults.push({ name: t.name, input: t.input, content: r.content });
      results.push({ type: 'tool_result', tool_use_id: t.id, content: r.content, is_error: r.is_error ?? false });
    }
    messages.push({ role: 'user', content: results });
  }
  return { ok: false, error: `Hit max ${MAX_ITERATIONS} tool-use iterations` };
}

/* ─── OpenAI-compatible loop — covers Groq AND OpenAI (same wire format) ─── */
async function runOpenAICompatLoop(
  opts: { baseUrl: string; apiKey: string; model: string; provider: string },
  userMessages: ChatMsg[], toolCalls: ToolCallLog, toolResults: ToolResultLog,
): Promise<LoopResult> {
  // Translate Anthropic tool schema → OpenAI function-calling schema.
  const oaTools = TOOLS.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  type OAMsg =
    | { role: 'system' | 'user' | 'assistant'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
    | { role: 'tool'; tool_call_id: string; content: string };

  const messages: OAMsg[] = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ...userMessages.map(m => ({ role: m.role, content: m.content } as OAMsg)),
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: opts.model, max_tokens: 2048, messages, tools: oaTools }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `${opts.provider} API ${res.status}: ${body.slice(0, 200)}` };
    }
    const j = await res.json();
    const choice = j.choices?.[0];
    const msg = choice?.message;
    if (!msg) return { ok: false, error: `${opts.provider}: empty completion` };

    const calls = (msg.tool_calls ?? []) as Array<{ id: string; function: { name: string; arguments: string } }>;
    if (calls.length === 0) {
      return { ok: true, reply: String(msg.content ?? ''), turns: i + 1, provider: opts.provider };
    }

    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const c of calls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(c.function.arguments || '{}'); } catch {}
      const r = await runTool(c.function.name, input);
      toolCalls.push({ name: c.function.name, input, result_preview: r.content.slice(0, 200) + (r.content.length > 200 ? '…' : '') });
      toolResults.push({ name: c.function.name, input, content: r.content });
      messages.push({ role: 'tool', tool_call_id: c.id, content: r.content });
    }
  }
  return { ok: false, error: `Hit max ${MAX_ITERATIONS} tool-use iterations` };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const me = await getCurrentUser().catch(() => null);
  const callerId = me?.id ?? null;
  const toolCalls: ToolCallLog = [];
  const toolResults: ToolResultLog = [];
  const latestUserQuestion = [...parsed.data.messages].reverse().find(m => m.role === 'user')?.content || '';

  // Provider chain: Groq → Anthropic → OpenAI. Each is tried only if its key
  // is configured; the first that completes wins. Tool state is reset between
  // attempts so a failed provider's partial calls don't leak into the reply.
  const attempts: Array<() => Promise<LoopResult>> = [];
  // Gate the Groq attempt on the shared provider decision so an explicit
  // LLM_PROVIDER=anthropic override actually skips Groq here too, instead of
  // only affecting the ops detector / Slack concierge.
  if (process.env.GROQ_API_KEY && llmProvider() === 'groq') {
    attempts.push(() => runOpenAICompatLoop(
      { baseUrl: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY!, model: process.env.CHAT_MODEL_GROQ || 'openai/gpt-oss-120b', provider: 'groq' },
      parsed.data.messages, toolCalls, toolResults,
    ));
  }
  if (process.env.ANTHROPIC_API_KEY) {
    attempts.push(() => runAnthropicLoop(parsed.data.messages, toolCalls, toolResults));
  }
  if (process.env.OPENAI_API_KEY) {
    attempts.push(() => runOpenAICompatLoop(
      { baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY!, model: process.env.CHAT_MODEL_OPENAI || 'gpt-4o-mini', provider: 'openai' },
      parsed.data.messages, toolCalls, toolResults,
    ));
  }
  // Backstop for 2026-09-16: Groq's daily TPD quota and the Anthropic key
  // were both down at once. One OpenRouter key reaches many vendors.
  if (process.env.OPENROUTER_API_KEY) {
    attempts.push(() => runOpenAICompatLoop(
      { baseUrl: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY!, model: process.env.CHAT_MODEL_OPENROUTER || 'anthropic/claude-sonnet-4.5', provider: 'openrouter' },
      parsed.data.messages, toolCalls, toolResults,
    ));
  }
  if (process.env.GEMINI_API_KEY) {
    attempts.push(() => runOpenAICompatLoop(
      { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: process.env.GEMINI_API_KEY!, model: process.env.CHAT_MODEL_GEMINI || 'gemini-2.0-flash', provider: 'gemini' },
      parsed.data.messages, toolCalls, toolResults,
    ));
  }
  if (attempts.length === 0) {
    return NextResponse.json({ error: 'No AI provider configured (set ANTHROPIC_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY)' }, { status: 500 });
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    toolCalls.length = 0;
    toolResults.length = 0;
    const r = await attempt();
    if (r.ok) {
      try {
        const { queries } = await import('@/lib/db');
        queries.logChatTurn({
          userId: callerId,
          question: latestUserQuestion,
          replyPreview: r.reply,
          toolCalls: toolCalls.length,
          turns: r.turns,
        });
      } catch { /* ignore */ }
      return NextResponse.json({
        reply: r.reply,
        tool_calls: toolCalls,
        hud: buildFlightHudPayload(latestUserQuestion, r.reply, toolResults),
        stop_reason: 'end_turn',
        provider: r.provider,
      });
    }
    errors.push(r.error);
    // A side-effecting tool (route write, settings change, report email, poll)
    // already ran in this attempt. Failing over replays the whole conversation,
    // so the next provider would do it a second time — stop here instead.
    if (toolCalls.some(c => CHAT_MUTATING_TOOLS.has(c.name))) {
      console.error('[chat] provider failed after a write; not failing over:', r.error);
      return NextResponse.json({
        reply:
          'Part of that went through before my AI provider dropped out. I stopped rather than risk '
          + 'doing it twice — please check your routes/settings, then ask me again if anything is missing.',
        tool_calls: toolCalls,
        stop_reason: 'end_turn',
        provider: 'partial',
      });
    }
  }

  // Never leak raw provider errors (API keys, billing state, request ids) to
  // the end user — log server-side, reply with a friendly concierge message.
  console.error('[chat] all providers failed:', errors.join(' | '));
  try {
    const { queries } = await import('@/lib/db');
    queries.logError({ source: 'chat', message: 'all AI providers failed',
      userId: callerId ?? undefined, context: { question: latestUserQuestion.slice(0, 200), errors } });
  } catch { /* best-effort */ }
  return NextResponse.json({
    reply:
      "I'm having trouble reaching my brain right now — the team has been notified. " +
      'In the meantime, your dashboard, alerts, and fare tracking are all running normally. ' +
      'Please try me again in a little while.',
    stop_reason: 'end_turn',
    provider: 'offline',
  });
}

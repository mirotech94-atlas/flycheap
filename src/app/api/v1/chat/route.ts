import { GROQ_CHAT_MODELS } from '@/lib/ai/providers';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { FAREPILOT_SYSTEM_PROMPT, FAREPILOT_TOOLS, runFarePilotTool, buildUserSnapshot } from '@/lib/farePilotTools';
import { queries } from '@/lib/db';
import { llmProvider } from '@/lib/llmProvider';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const Schema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
  })).min(1).max(30),
});

const MAX_ITERATIONS = 6;
// Anthropic is a fallback here (GROQ_API_KEY unset, or LLM_PROVIDER=anthropic)
// — see src/lib/llmProvider.ts. Fast, tool-capable: concierge latency matters
// more than depth here.
const ANTHROPIC_MODEL = 'claude-haiku-4-5';

function baseFromReq(req: Request): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'flycheap.18dn.com';
  return `${proto}://${host}`;
}

type ChatMsg = { role: 'user' | 'assistant'; content: string };
type LoopResult = { ok: true; reply: string } | { ok: false; error: string; status: number };

/* ─── Anthropic loop (fallback) ─── */
async function runAnthropicLoop(
  system: string, userMessages: ChatMsg[], userId: number, baseUrl: string,
): Promise<LoopResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY not set', status: 500 };
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = userMessages.map((m) => ({ role: m.role, content: m.content }));

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({ model: ANTHROPIC_MODEL, max_tokens: 1024, system, tools: FAREPILOT_TOOLS, messages });
    } catch (e) {
      if (e instanceof Anthropic.APIError) return { ok: false, error: `FarePilot upstream error (${e.status}).`, status: 502 };
      return { ok: false, error: (e as Error).message, status: 500 };
    }

    if (response.stop_reason !== 'tool_use') {
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n');
      return { ok: true, reply: text };
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) {
      const r = await runFarePilotTool(userId, t.name, (t.input ?? {}) as Record<string, unknown>, baseUrl);
      results.push({ type: 'tool_result', tool_use_id: t.id, content: r.content, is_error: r.is_error ?? false });
    }
    messages.push({ role: 'user', content: results });
  }
  return { ok: false, error: 'FarePilot couldn’t complete that — try rephrasing.', status: 500 };
}

/* ─── OpenAI-compatible loop — covers Groq (primary) AND OpenAI (same wire format) ─── */
async function runOpenAICompatLoop(
  opts: { baseUrl: string; apiKey: string; model: string; provider: string },
  system: string, userMessages: ChatMsg[], userId: number, baseUrl: string,
): Promise<LoopResult> {
  const oaTools = FAREPILOT_TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  type OAMsg =
    | { role: 'system' | 'user' | 'assistant'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
    | { role: 'tool'; tool_call_id: string; content: string };

  const messages: OAMsg[] = [
    { role: 'system', content: system },
    ...userMessages.map((m) => ({ role: m.role, content: m.content } as OAMsg)),
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: opts.model, max_tokens: 1024, messages, tools: oaTools }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `${opts.provider} API ${res.status}: ${body.slice(0, 200)}`, status: 502 };
    }
    const j = await res.json();
    const choice = j.choices?.[0];
    const msg = choice?.message;
    if (!msg) return { ok: false, error: `${opts.provider}: empty completion`, status: 502 };

    const calls = (msg.tool_calls ?? []) as Array<{ id: string; function: { name: string; arguments: string } }>;
    if (calls.length === 0) {
      return { ok: true, reply: String(msg.content ?? '') };
    }

    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const c of calls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(c.function.arguments || '{}'); } catch { /* ignore */ }
      const r = await runFarePilotTool(userId, c.function.name, input, baseUrl);
      messages.push({ role: 'tool', tool_call_id: c.id, content: r.content });
    }
  }
  return { ok: false, error: 'FarePilot couldn’t complete that — try rephrasing.', status: 500 };
}

function buildAttempts(system: string, userMessages: ChatMsg[], userId: number, baseUrl: string): Array<() => Promise<LoopResult>> {
  // Provider chain: Groq → Anthropic → OpenAI, same order and env-var
  // conventions as the web concierge (src/app/api/chat/route.ts).
  const attempts: Array<() => Promise<LoopResult>> = [];
  if (process.env.GROQ_API_KEY && llmProvider() === 'groq') {
    // Rotate every Groq chat model — each has its own daily token cap, so a
    // capped model falls back to the next before any paid provider is hit.
    const groqFirst = process.env.CHAT_MODEL_GROQ;
    const groqModels = groqFirst ? [groqFirst, ...GROQ_CHAT_MODELS.filter(m => m !== groqFirst)] : GROQ_CHAT_MODELS;
    for (const gm of groqModels) {
      attempts.push(() => runOpenAICompatLoop(
        { baseUrl: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY!, model: gm, provider: 'groq' },
        system, userMessages, userId, baseUrl,
      ));
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    attempts.push(() => runAnthropicLoop(system, userMessages, userId, baseUrl));
  }
  if (process.env.OPENAI_API_KEY) {
    attempts.push(() => runOpenAICompatLoop(
      { baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY!, model: process.env.CHAT_MODEL_OPENAI || 'gpt-4o-mini', provider: 'openai' },
      system, userMessages, userId, baseUrl,
    ));
  }
  return attempts;
}

/**
 * POST /api/v1/chat — FarePilot, scoped to the signed-in user. Same agent loop as the
 * web concierge, but bearer-authed and using the user-scoped FarePilot toolset, so it can
 * only ever see/act on the caller's own routes and settings.
 */
export async function POST(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  if (llmProvider() === 'none') return NextResponse.json({ error: 'FarePilot is not configured on the server.' }, { status: 500 });

  // Light abuse cap: 30 chat turns / 5 min per user.
  if (!queries.rateLimitCheck('farepilot', String(user.id), 30, 300)) {
    return NextResponse.json({ error: 'You’re sending messages too fast — give it a moment.' }, { status: 429 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid messages' }, { status: 400 });

  const baseUrl = baseFromReq(req);
  // Inject a live snapshot of the user's routes so read questions resolve in ONE call.
  const system = `${FAREPILOT_SYSTEM_PROMPT}\n\n${buildUserSnapshot(user.id)}`;

  // Streaming path (?stream=1): emit the reply as plain-text deltas so the app shows it
  // building in real time. Tool turns run server-side between streamed text; the client
  // renders markdown only once the stream closes (a half-streamed table is meaningless).
  //
  // True token-by-token streaming is only wired up for the Anthropic fallback path (its
  // SDK gives us a delta stream for free). When Groq/OpenAI are used, we run the same
  // provider loop as the non-streaming path and flush the finished reply as one chunk —
  // still a valid text/plain delta stream, and the client already treats it as opaque
  // until it closes.
  if (new URL(req.url).searchParams.get('stream') === '1') {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (llmProvider() === 'anthropic') {
            const apiKey = process.env.ANTHROPIC_API_KEY!;
            const client = new Anthropic({ apiKey });
            const messages: Anthropic.MessageParam[] = parsed.data.messages.map((m) => ({ role: m.role, content: m.content }));
            for (let i = 0; i < MAX_ITERATIONS; i++) {
              const ms = client.messages.stream({ model: ANTHROPIC_MODEL, max_tokens: 1024, system, tools: FAREPILOT_TOOLS, messages });
              ms.on('text', (delta) => { try { controller.enqueue(encoder.encode(delta)); } catch { /* closed */ } });
              const final = await ms.finalMessage();
              if (final.stop_reason !== 'tool_use') break;
              messages.push({ role: 'assistant', content: final.content });
              const toolUses = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
              const results: Anthropic.ToolResultBlockParam[] = [];
              for (const t of toolUses) {
                const r = await runFarePilotTool(user.id, t.name, (t.input ?? {}) as Record<string, unknown>, baseUrl);
                results.push({ type: 'tool_result', tool_use_id: t.id, content: r.content, is_error: r.is_error ?? false });
              }
              messages.push({ role: 'user', content: results });
            }
          } else {
            const attempts = buildAttempts(system, parsed.data.messages, user.id, baseUrl);
            let result: LoopResult = { ok: false, error: 'No AI provider configured.', status: 500 };
            for (const attempt of attempts) {
              result = await attempt();
              if (result.ok) break;
            }
            controller.enqueue(encoder.encode(result.ok ? result.reply : `⚠️ ${result.error}`));
          }
        } catch (e) {
          try { controller.enqueue(encoder.encode(`\n\n⚠️ ${(e as Error).message}`)); } catch { /* closed */ }
        } finally {
          controller.close();
        }
      },
    });
    return new Response(body, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
    });
  }

  const attempts = buildAttempts(system, parsed.data.messages, user.id, baseUrl);
  let last: LoopResult = { ok: false, error: 'No AI provider configured.', status: 500 };
  for (const attempt of attempts) {
    last = await attempt();
    if (last.ok) return NextResponse.json({ reply: last.reply });
  }
  return NextResponse.json({ error: last.ok ? '' : last.error }, { status: last.ok ? 200 : last.status });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { ADMIN_SYSTEM_PROMPT, ADMIN_TOOLS, runAdminTool } from '@/lib/adminAgentTools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const Schema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(1).max(40),
});

const MAX_ITERATIONS = 8;

type ChatMsg = { role: 'user' | 'assistant'; content: string };
type ToolCall = { name: string; input: unknown; result_preview: string };
type LoopResult =
  | { ok: true; reply: string; turns: number; provider: string; toolCalls: ToolCall[] }
  | { ok: false; error: string };

async function runLoop(
  opts: { baseUrl: string; apiKey: string; model: string; provider: string },
  userMessages: ChatMsg[], adminUserId: number | null,
): Promise<LoopResult> {
  const oaTools = ADMIN_TOOLS.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
  type OAMsg =
    | { role: 'system' | 'user' | 'assistant'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
    | { role: 'tool'; tool_call_id: string; content: string };

  const messages: OAMsg[] = [
    { role: 'system', content: ADMIN_SYSTEM_PROMPT },
    ...userMessages.map(m => ({ role: m.role, content: m.content } as OAMsg)),
  ];
  const toolCalls: ToolCall[] = [];

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
    const jr = await res.json();
    const msg = jr.choices?.[0]?.message;
    if (!msg) return { ok: false, error: `${opts.provider}: empty completion` };

    const calls = (msg.tool_calls ?? []) as Array<{ id: string; function: { name: string; arguments: string } }>;
    if (calls.length === 0) {
      return { ok: true, reply: String(msg.content ?? ''), turns: i + 1, provider: opts.provider, toolCalls };
    }
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const c of calls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(c.function.arguments || '{}'); } catch { /* keep {} */ }
      const r = await runAdminTool(c.function.name, input, adminUserId);
      toolCalls.push({ name: c.function.name, input, result_preview: r.content.slice(0, 300) });
      messages.push({ role: 'tool', tool_call_id: c.id, content: r.content });
    }
  }
  return { ok: false, error: `Hit max ${MAX_ITERATIONS} tool-use iterations` };
}

export async function POST(req: Request) {
  // OWNER-ONLY. This endpoint can run arbitrary SQL and shell on production.
  const me = await getCurrentUser().catch(() => null);
  if (!me || !isOwner(me)) {
    return NextResponse.json({ error: 'Forbidden — owner only.' }, { status: 403 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const attempts: Array<() => Promise<LoopResult>> = [];
  if (process.env.GROQ_API_KEY) attempts.push(() => runLoop(
    { baseUrl: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY!, model: process.env.CHAT_MODEL_GROQ || 'openai/gpt-oss-120b', provider: 'groq' },
    parsed.data.messages, me.id));
  if (process.env.OPENAI_API_KEY) attempts.push(() => runLoop(
    { baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY!, model: process.env.CHAT_MODEL_OPENAI || 'gpt-4o-mini', provider: 'openai' },
    parsed.data.messages, me.id));
  if (attempts.length === 0) {
    return NextResponse.json({ error: 'No AI provider configured (set GROQ_API_KEY or OPENAI_API_KEY).' }, { status: 500 });
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    const r = await attempt();
    if (r.ok) return NextResponse.json({ reply: r.reply, provider: r.provider, tool_calls: r.toolCalls });
    errors.push(r.error);
  }
  return NextResponse.json({ error: `All providers failed: ${errors.join(' | ')}` }, { status: 502 });
}

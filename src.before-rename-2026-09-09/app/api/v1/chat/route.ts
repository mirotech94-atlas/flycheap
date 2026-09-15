import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { FAREPILOT_SYSTEM_PROMPT, FAREPILOT_TOOLS, runFarePilotTool, buildUserSnapshot } from '@/lib/farePilotTools';
import { queries } from '@/lib/db';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const Schema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
  })).min(1).max(30),
});

const MAX_ITERATIONS = 6;

function baseFromReq(req: Request): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'flycheap.18dn.com';
  return `${proto}://${host}`;
}

/**
 * POST /api/v1/chat — FarePilot, scoped to the signed-in user. Same agent loop as the
 * web concierge, but bearer-authed and using the user-scoped FarePilot toolset, so it can
 * only ever see/act on the caller's own routes and settings.
 */
export async function POST(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'FarePilot is not configured on the server.' }, { status: 500 });

  // Light abuse cap: 30 chat turns / 5 min per user.
  if (!queries.rateLimitCheck('farepilot', String(user.id), 30, 300)) {
    return NextResponse.json({ error: 'You’re sending messages too fast — give it a moment.' }, { status: 429 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid messages' }, { status: 400 });

  const client = new Anthropic({ apiKey });
  const baseUrl = baseFromReq(req);
  // Inject a live snapshot of the user's routes so read questions resolve in ONE call.
  const system = `${FAREPILOT_SYSTEM_PROMPT}\n\n${buildUserSnapshot(user.id)}`;
  const messages: Anthropic.MessageParam[] = parsed.data.messages.map((m) => ({ role: m.role, content: m.content }));

  // Streaming path (?stream=1): emit the reply as plain-text deltas so the app shows it
  // building in real time. Tool turns run server-side between streamed text; the client
  // renders markdown only once the stream closes (a half-streamed table is meaningless).
  if (new URL(req.url).searchParams.get('stream') === '1') {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (let i = 0; i < MAX_ITERATIONS; i++) {
            const ms = client.messages.stream({ model: 'claude-haiku-4-5', max_tokens: 1024, system, tools: FAREPILOT_TOOLS, messages });
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

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: 'claude-haiku-4-5', // fast, tool-capable — concierge latency matters more than depth here
        max_tokens: 1024,
        system,
        tools: FAREPILOT_TOOLS,
        messages,
      });
    } catch (e) {
      if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `FarePilot upstream error (${e.status}).` }, { status: 502 });
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }

    if (response.stop_reason !== 'tool_use') {
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n');
      return NextResponse.json({ reply: text });
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) {
      const r = await runFarePilotTool(user.id, t.name, (t.input ?? {}) as Record<string, unknown>, baseUrl);
      results.push({ type: 'tool_result', tool_use_id: t.id, content: r.content, is_error: r.is_error ?? false });
    }
    messages.push({ role: 'user', content: results });
  }

  return NextResponse.json({ error: 'FarePilot couldn’t complete that — try rephrasing.' }, { status: 500 });
}

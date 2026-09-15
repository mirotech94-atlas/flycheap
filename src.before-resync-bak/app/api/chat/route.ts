import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { CHAT_SYSTEM_PROMPT, TOOLS, runTool } from '@/lib/chatTools';
import { buildFlightHudPayload } from '@/lib/flightHud';

export const maxDuration = 60;

const Schema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(1).max(40),
});

const MAX_ITERATIONS = 6;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set on the server' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = parsed.data.messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const toolCalls: Array<{ name: string; input: unknown; result_preview: string }> = [];
  const toolResults: Array<{ name: string; input: unknown; content: string }> = [];
  const latestUserQuestion = [...parsed.data.messages].reverse().find(m => m.role === 'user')?.content || '';

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: CHAT_SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });
    } catch (e) {
      if (e instanceof Anthropic.APIError) {
        return NextResponse.json({ error: `Anthropic API ${e.status}: ${e.message}` }, { status: 502 });
      }
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens' || response.stop_reason === 'refusal') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      return NextResponse.json({
        reply: text,
        tool_calls: toolCalls,
        hud: buildFlightHudPayload(latestUserQuestion, text, toolResults),
        stop_reason: response.stop_reason,
      });
    }

    if (response.stop_reason !== 'tool_use') {
      return NextResponse.json({ error: `Unexpected stop_reason: ${response.stop_reason}` }, { status: 500 });
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const t of toolUses) {
      const r = await runTool(t.name, (t.input ?? {}) as Record<string, unknown>);
      toolCalls.push({
        name: t.name,
        input: t.input,
        result_preview: r.content.slice(0, 200) + (r.content.length > 200 ? '…' : ''),
      });
      toolResults.push({
        name: t.name,
        input: t.input,
        content: r.content,
      });
      results.push({
        type: 'tool_result',
        tool_use_id: t.id,
        content: r.content,
        is_error: r.is_error ?? false,
      });
    }
    messages.push({ role: 'user', content: results });
  }

  return NextResponse.json({ error: `Hit max ${MAX_ITERATIONS} tool-use iterations without resolving.` }, { status: 500 });
}

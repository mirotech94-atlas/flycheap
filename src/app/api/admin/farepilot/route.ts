import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { getCurrentUser, isOwner, isAdminHost, SESSION_COOKIE } from '@/lib/auth';
import { verify as verifyTotp } from '@/lib/totp';
import { queries } from '@/lib/db';
import { ADMIN_SYSTEM_PROMPT, ADMIN_TOOLS, runAdminTool, type AdminToolCtx } from '@/lib/adminAgentTools';
import {
  recordStepUp, stepUpValid, isCodeReplay,
  verifyAllowed, recordVerifyAttempt, clearVerifyAttempts, VERIFY_LIMIT_INFO,
} from '@/lib/adminAgentState';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const Schema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(8000),
  })).min(1).max(40),
  totp: z.string().max(12).optional(),
});

const MAX_ITERATIONS = 8;

type ChatMsg = { role: 'user' | 'assistant'; content: string };
type ToolCall = { name: string; input: unknown; result_preview: string };
type LoopResult =
  | { ok: true; reply: string; provider: string; toolCalls: ToolCall[]; neededStepUp: boolean; executed: boolean }
  | { ok: false; error: string; executed: boolean };

async function runLoop(
  opts: { baseUrl: string; apiKey: string; model: string; provider: string },
  userMessages: ChatMsg[], ctx: AdminToolCtx,
): Promise<LoopResult> {
  const oaTools = ADMIN_TOOLS.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  type OAMsg =
    | { role: 'system' | 'user' | 'assistant'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
    | { role: 'tool'; tool_call_id: string; content: string };

  const messages: OAMsg[] = [
    { role: 'system', content: ADMIN_SYSTEM_PROMPT },
    ...userMessages.map(m => ({ role: m.role, content: m.content } as OAMsg)),
  ];
  const toolCalls: ToolCall[] = [];
  let neededStepUp = false;
  let executed = false;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: opts.model, max_tokens: 2048, messages, tools: oaTools }),
    });
    if (!res.ok) return { ok: false, error: `${opts.provider} API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`, executed };
    const jr = await res.json();
    const msg = jr.choices?.[0]?.message;
    if (!msg) return { ok: false, error: `${opts.provider}: empty completion`, executed };

    const calls = (msg.tool_calls ?? []) as Array<{ id: string; function: { name: string; arguments: string } }>;
    if (calls.length === 0) return { ok: true, reply: String(msg.content ?? ''), provider: opts.provider, toolCalls, neededStepUp, executed };

    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const c of calls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(c.function.arguments || '{}'); } catch { /* keep {} */ }
      const r = await runAdminTool(c.function.name, input, ctx);
      if (r.needs_step_up) neededStepUp = true; else executed = true; // a tool that actually ran
      toolCalls.push({ name: c.function.name, input, result_preview: r.content.slice(0, 300) });
      messages.push({ role: 'tool', tool_call_id: c.id, content: r.content });
    }
  }
  return { ok: false, error: `Hit max ${MAX_ITERATIONS} tool-use iterations`, executed };
}

export async function POST(req: Request) {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';

  // I3: this endpoint answers only on the admin host, and only same-origin.
  if (!isAdminHost(host)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const secFetchSite = h.get('sec-fetch-site');
  const origin = h.get('origin');
  const sameOrigin = secFetchSite === 'same-origin' || (!!origin && (() => { try { return new URL(origin).host === host; } catch { return false; } })());
  if (secFetchSite && !sameOrigin) return NextResponse.json({ error: 'Cross-origin request refused.' }, { status: 403 });

  // OWNER-ONLY.
  const me = await getCurrentUser().catch(() => null);
  if (!me || !isOwner(me)) return NextResponse.json({ error: 'Forbidden — owner only.' }, { status: 403 });

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';
  // C2a: prefer an env seed for the gate so a plain DB read cannot reveal it.
  const seed = (process.env.OWNER_TOTP_SECRET || (me.totp_secret ?? '')).trim();
  const totpEnabled = (me.totp_enabled === 1 || !!process.env.OWNER_TOTP_SECRET) && !!seed;
  const submitted = (parsed.data.totp ?? '').trim();

  let stepUpJustGranted = false;
  if (submitted) {
    // C1: limit step-up attempts (per session AND per IP) before verifying.
    if (!verifyAllowed(token) || !verifyAllowed(`ip:${ip}`)) {
      try { queries.logAdminAgentAction({ adminUserId: me.id, tool: 'step_up_verify', input: '', resultPreview: 'blocked: too many code attempts', ok: false }); } catch { /* ignore */ }
      return NextResponse.json({ error: `Too many code attempts — wait ${VERIFY_LIMIT_INFO.windowMin} minutes.`, needs_totp: totpEnabled }, { status: 429 });
    }
    recordVerifyAttempt(token); recordVerifyAttempt(`ip:${ip}`);
    if (!totpEnabled || !verifyTotp(seed, submitted) || isCodeReplay(token, submitted)) {
      try { queries.logAdminAgentAction({ adminUserId: me.id, tool: 'step_up_verify', input: '', resultPreview: isCodeReplay(token, submitted) ? 'reused code' : 'bad code', ok: false }); } catch { /* ignore */ }
      return NextResponse.json({ error: totpEnabled ? 'That code did not verify — try again.' : 'Two-factor authentication is not enabled.', totp_enabled: totpEnabled, needs_totp: totpEnabled }, { status: 401 });
    }
    clearVerifyAttempts(token); clearVerifyAttempts(`ip:${ip}`);
    recordStepUp(token, submitted);
    stepUpJustGranted = true;
  }
  const stepUpOk = totpEnabled && (stepUpJustGranted || stepUpValid(token));
  const ctx: AdminToolCtx = { adminUserId: me.id, stepUpOk };

  const attempts: Array<() => Promise<LoopResult>> = [];
  if (process.env.GROQ_API_KEY) attempts.push(() => runLoop({ baseUrl: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY!, model: process.env.CHAT_MODEL_GROQ || 'openai/gpt-oss-120b', provider: 'groq' }, parsed.data.messages, ctx));
  if (process.env.OPENAI_API_KEY) attempts.push(() => runLoop({ baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY!, model: process.env.CHAT_MODEL_OPENAI || 'gpt-4o-mini', provider: 'openai' }, parsed.data.messages, ctx));
  if (attempts.length === 0) return NextResponse.json({ error: 'No AI provider configured (set GROQ_API_KEY or OPENAI_API_KEY).' }, { status: 500 });

  const errors: string[] = [];
  for (const attempt of attempts) {
    const r = await attempt();
    if (r.ok) return NextResponse.json({ reply: r.reply, provider: r.provider, tool_calls: r.toolCalls, needs_totp: r.neededStepUp && !stepUpOk, totp_enabled: totpEnabled });
    errors.push(r.error);
    // I2: if a tool already ran this turn, do NOT retry another provider (would
    // re-execute side effects). Return the error with what happened.
    if (r.executed) return NextResponse.json({ error: `Provider failed after tools ran: ${r.error}. Not retrying to avoid re-executing actions.` }, { status: 502 });
  }
  return NextResponse.json({ error: `All providers failed: ${errors.join(' | ')}` }, { status: 502 });
}

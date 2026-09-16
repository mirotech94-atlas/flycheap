import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { getCurrentUser, isOwner, SESSION_COOKIE } from '@/lib/auth';
import { verify as verifyTotp } from '@/lib/totp';
import { queries } from '@/lib/db';
import { adminHostOk, sameOriginOk, clientIp } from '@/lib/adminGuard';
import { ADMIN_SYSTEM_PROMPT, ADMIN_TOOLS, runAdminTool, PRIVILEGED_TOOLS, type AdminToolCtx } from '@/lib/adminAgentTools';
import {
  recordStepUp, stepUpValid, isCodeConsumed, consumeCode,
  verifyAllowed, recordVerifyAttempt, clearVerifyAttempts, VERIFY_LIMIT_INFO,
} from '@/lib/adminAgentState';
import { buildProviderChain } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

// F10: fail closed but shout if the env seed is not usable base32.
if (process.env.OWNER_TOTP_SECRET && !/^[A-Z2-7]+=*$/i.test(process.env.OWNER_TOTP_SECRET.trim())) {
  console.error('[farepilot] OWNER_TOTP_SECRET is set but is not valid base32 — step-up will fail closed.');
}

const Schema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).min(1).max(40),
  totp: z.string().max(12).optional(),
});

const MAX_ITERATIONS = 8;

type ChatMsg = { role: 'user' | 'assistant'; content: string };
type ToolCall = { name: string; input: unknown; result_preview: string };
type LoopResult =
  | { ok: true; reply: string; provider: string; toolCalls: ToolCall[]; neededStepUp: boolean; executed: boolean }
  | { ok: false; error: string; executed: boolean };

async function runLoop(
  opts: { baseUrl: string; apiKey: string; model: string; provider: string; headers?: Record<string, string> },
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
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
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
      if (r.needs_step_up) neededStepUp = true;
      // F7: only a privileged tool that actually ran disables provider fallback.
      else if (PRIVILEGED_TOOLS.has(c.function.name)) executed = true;
      toolCalls.push({ name: c.function.name, input, result_preview: r.content.slice(0, 300) });
      // F4: everything a tool returns is untrusted data, never instructions.
      messages.push({ role: 'tool', tool_call_id: c.id, content: `<untrusted_data tool="${c.function.name}">\n${r.content}\n</untrusted_data>` });
    }
  }
  return { ok: false, error: `Hit max ${MAX_ITERATIONS} tool-use iterations`, executed };
}

/** Turns raw provider errors into one honest sentence for the owner. The
 * common real case right now: Groq's free tier is capped at 200k tokens/day
 * and no paid fallback has credit, so the whole chain is temporarily dry. */
function humanizeProviderFailure(errors: string[]): string {
  const blob = errors.join(' | ');
  const dailyCap = /per day|tokens per day|\bTPD\b|rate limit reached/i.test(blob) && /200000|200,000|limit \d/i.test(blob);
  const noCredit = /credit balance is too low|billing|quota|insufficient/i.test(blob);
  if (dailyCap || noCredit) {
    return 'AI is temporarily unavailable — the free daily token limit is used up and no paid fallback has credit right now. Groq resets at 00:00 UTC, or add credit to Groq (Dev tier) / Anthropic to restore it immediately.';
  }
  return `AI providers are failing: ${blob.slice(0, 300)}`;
}

export async function POST(req: Request) {
  const h = await headers();
  if (!adminHostOk(h)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });          // I3
  if (!sameOriginOk(h)) return NextResponse.json({ error: 'Cross-origin request refused.' }, { status: 403 }); // B3

  const me = await getCurrentUser().catch(() => null);
  if (!me || !isOwner(me)) return NextResponse.json({ error: 'Forbidden — owner only.' }, { status: 403 });

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
  const ip = clientIp(h); // F1: last hop
  const seed = (process.env.OWNER_TOTP_SECRET || (me.totp_secret ?? '')).trim();
  const totpEnabled = (me.totp_enabled === 1 || !!process.env.OWNER_TOTP_SECRET) && !!seed;
  const submitted = (parsed.data.totp ?? '').trim();

  let stepUpJustGranted = false;
  if (submitted) {
    if (!verifyAllowed(token) || !verifyAllowed(`ip:${ip}`)) {
      try { queries.logAdminAgentAction({ adminUserId: me.id, tool: 'step_up_verify', input: '', resultPreview: `blocked: too many attempts (${host})`, ok: false }); } catch { /* ignore */ }
      return NextResponse.json({ error: `Too many code attempts — wait ${VERIFY_LIMIT_INFO.windowMin} minutes.`, needs_totp: totpEnabled }, { status: 429 });
    }
    recordVerifyAttempt(token); recordVerifyAttempt(`ip:${ip}`);
    const good = totpEnabled && verifyTotp(seed, submitted) && !isCodeConsumed(me.id, submitted);
    if (!good) {
      try { queries.logAdminAgentAction({ adminUserId: me.id, tool: 'step_up_verify', input: '', resultPreview: !totpEnabled ? 'no 2fa' : (isCodeConsumed(me.id, submitted) ? 'reused code' : 'bad code'), ok: false }); } catch { /* ignore */ }
      return NextResponse.json({ error: totpEnabled ? 'That code did not verify — try again.' : 'Two-factor authentication is not enabled.', totp_enabled: totpEnabled, needs_totp: totpEnabled }, { status: 401 });
    }
    consumeCode(me.id, submitted);
    clearVerifyAttempts(token); clearVerifyAttempts(`ip:${ip}`);
    recordStepUp(token);
    stepUpJustGranted = true;
  }
  const stepUpOk = totpEnabled && (stepUpJustGranted || stepUpValid(token));
  const ctx: AdminToolCtx = { adminUserId: me.id, stepUpOk };

  // Multi-provider failover chain from the registry (src/lib/ai/providers.ts):
  // free tiers first (Groq's two models have separate daily buckets), then any
  // configured paid/self-hosted provider, each via its OpenAI-compatible
  // endpoint so this one runLoop drives them all. Only providers whose keys
  // are set enter the chain. The F7 `executed` guard below still stops the
  // chain the moment a privileged tool has run, so a longer chain never
  // re-executes an action.
  const chain = buildProviderChain();
  if (chain.length === 0) return NextResponse.json({ error: 'No AI provider configured (set GROQ_API_KEY, or add a fallback provider key).' }, { status: 500 });

  const errors: string[] = [];
  for (const step of chain) {
    const r = await runLoop(step, parsed.data.messages, ctx);
    if (r.ok) return NextResponse.json({ reply: r.reply, provider: r.provider, tool_calls: r.toolCalls, needs_totp: r.neededStepUp && !stepUpOk, totp_enabled: totpEnabled });
    errors.push(`${step.provider}: ${r.error}`);
    if (r.executed) return NextResponse.json({ error: `Provider failed after a privileged tool ran: ${r.error}. Not retrying to avoid re-executing actions.` }, { status: 502 }); // I2
  }
  return NextResponse.json({ error: humanizeProviderFailure(errors) }, { status: 502 });
}

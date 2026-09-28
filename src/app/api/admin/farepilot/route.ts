import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { getCurrentUser, isOwner, SESSION_COOKIE } from '@/lib/auth';
import { verify as verifyTotp } from '@/lib/totp';
import { queries } from '@/lib/db';
import { adminHostOk, sameOriginOk, clientIp } from '@/lib/adminGuard';
import { type AdminToolCtx } from '@/lib/adminAgentTools';
import { runLoop, MAX_ITERATIONS } from '@/lib/farePilotLoop';
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
  const ctx: AdminToolCtx = { adminUserId: me.id, stepUpOk, stepUpAvailable: totpEnabled };

  // Multi-provider failover chain from the registry (src/lib/ai/providers.ts):
  // free tiers first (Groq's two models have separate daily buckets), then any
  // configured paid/self-hosted provider, each via its OpenAI-compatible
  // endpoint so this one runLoop drives them all. Only providers whose keys
  // are set enter the chain. The F7 `executed` guard below still stops the
  // chain the moment a privileged tool has run, so a longer chain never
  // re-executes an action.
  const chain = buildProviderChain();
  if (chain.length === 0) return NextResponse.json({ error: 'No AI provider configured (set GROQ_API_KEY, or add a fallback provider key).' }, { status: 500 });

  const r = await runLoop(chain, parsed.data.messages, ctx);
  if (r.ok) {
    return NextResponse.json({
      reply: r.reply, provider: r.provider, tool_calls: r.toolCalls,
      needs_totp: r.neededStepUp && !stepUpOk, totp_enabled: totpEnabled,
      hit_step_limit: r.limitHit ?? false,
    });
  }
  // Two very different failures: the tool budget ran out (the work happened, we
  // just could not wrap it up) vs every model being unavailable. Say which.
  const tail = r.executed ? ' Some actions had already run — check the audit trail below.' : '';
  const message = r.limitHit ? r.error + tail : humanizeProviderFailure([r.error]) + tail;
  return NextResponse.json({ error: message, tool_calls: r.toolCalls ?? [] }, { status: 502 });
}

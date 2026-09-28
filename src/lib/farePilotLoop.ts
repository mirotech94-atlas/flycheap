import 'server-only';
import { ADMIN_SYSTEM_PROMPT, ADMIN_TOOLS, runAdminTool, PRIVILEGED_TOOLS, buildLiveTableList, type AdminToolCtx } from '@/lib/adminAgentTools';
import type { ProviderAttempt } from '@/lib/ai/providers';

/** Tool steps allowed per turn. Real diagnostic work legitimately needs room to
 *  look something up, correct course, and then answer — 8 was too tight and the
 *  agent kept dying mid-investigation with nothing to show for it. */
export const MAX_ITERATIONS = 16;

/** How much of a tool's output is fed BACK to the model. The full result still
 *  reaches the owner via result_preview; the model only needs the head of it.
 *  Groq's free tier is 8,000 tokens/MINUTE and the message array is resent on
 *  every iteration, so an 8KB SQL dump re-sent 5 times is what trips the 429. */
export const MODEL_TOOL_RESULT_CHARS = 2000;

export type ChatMsg = { role: 'user' | 'assistant'; content: string };
export type ToolCall = { name: string; input: unknown; result_preview: string };
export type LoopResult =
  | { ok: true; reply: string; provider: string; toolCalls: ToolCall[]; neededStepUp: boolean; executed: boolean; limitHit?: boolean }
  | { ok: false; error: string; executed: boolean; limitHit?: boolean; toolCalls?: ToolCall[] };

export function forModel(content: string): string {
  return content.length <= MODEL_TOOL_RESULT_CHARS
    ? content
    : `${content.slice(0, MODEL_TOOL_RESULT_CHARS)}\n…[truncated ${content.length - MODEL_TOOL_RESULT_CHARS} chars — narrow the query if you need the rest]`;
}

const KNOWN_TOOLS: ReadonlySet<string> = new Set(ADMIN_TOOLS.map(t => t.name));

/**
 * Wrap a tool result for the model. Tool output is attacker-reachable (client
 * emails, error text, row values), so it must not be able to END the wrapper:
 * a row containing `</untrusted_data>` followed by fake instructions would
 * otherwise read as if it came from outside the data block. Every `<` and `>`
 * inside is entity-escaped, so the only tags left are the two written here,
 * and the tool= attribute is a known tool name or "unknown", never
 * model-controlled text.
 */
export function wrapUntrusted(toolName: string, content: string): string {
  const tool = KNOWN_TOOLS.has(toolName) ? toolName : 'unknown';
  const body = forModel(content).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<untrusted_data tool="${tool}">\n${body}\n</untrusted_data>`;
}

type OAMsg =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string };

type OAChoiceMsg = { content?: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> };

async function callModel(
  opts: ProviderAttempt, messages: OAMsg[], tools: unknown[] | null,
): Promise<{ ok: true; msg: OAChoiceMsg } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      body: JSON.stringify({ model: opts.model, max_tokens: tools ? 2048 : 1024, messages, ...(tools ? { tools } : {}) }),
    });
  } catch (e) {
    return { ok: false, error: `${opts.provider}: ${(e as Error).message}` };
  }
  if (!res.ok) return { ok: false, error: `${opts.provider} API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
  const jr = await res.json().catch(() => null) as { choices?: Array<{ message?: OAChoiceMsg }> } | null;
  const msg = jr?.choices?.[0]?.message;
  if (!msg) return { ok: false, error: `${opts.provider}: empty completion` };
  return { ok: true, msg };
}

/**
 * Drive the FarePilot agent loop, failing over BETWEEN models *inside* the loop.
 *
 * The important property: the message array — including every tool result already
 * gathered — is preserved across a model switch, so when a provider call fails
 * mid-conversation (the common case being Groq's per-model 8k tokens/minute 429)
 * the turn RESUMES on the next model instead of replaying. Because we resume
 * rather than replay, a switch can never re-enter the tool-execution block.
 *
 * On running out of tool steps we do NOT throw the work away: one final call with
 * tools disabled turns whatever was found into an answer for the owner.
 */
export async function runLoop(
  chain: ProviderAttempt[], userMessages: ChatMsg[], ctx: AdminToolCtx,
): Promise<LoopResult> {
  const oaTools = ADMIN_TOOLS.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  // The live table list is queried once per request (cheap: one sqlite_master
  // SELECT) and appended to the system prompt so the model never has to guess
  // — or worse, assume absence — about what tables currently exist.
  const messages: OAMsg[] = [
    { role: 'system', content: `${ADMIN_SYSTEM_PROMPT}\n\n${buildLiveTableList()}` },
    ...userMessages.map(m => ({ role: m.role, content: m.content } as OAMsg)),
  ];
  const toolCalls: ToolCall[] = [];
  const errors: string[] = [];
  let neededStepUp = false;
  let executed = false;
  let stepIdx = 0; // which provider/model we are currently on

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let msg: OAChoiceMsg | null = null;
    let provider = '';
    // Ask the current model; on a provider-side failure advance to the next and
    // retry THIS same iteration with the same messages (no replay, no re-exec).
    while (stepIdx < chain.length) {
      const r = await callModel(chain[stepIdx], messages, oaTools);
      provider = chain[stepIdx].provider;
      if (r.ok) { msg = r.msg; break; }
      errors.push(r.error);
      stepIdx++;
    }
    if (!msg) return { ok: false, error: errors.join(' | '), executed, toolCalls };

    const calls = (msg.tool_calls ?? []);
    if (calls.length === 0) return { ok: true, reply: String(msg.content ?? ''), provider, toolCalls, neededStepUp, executed };

    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });
    for (const c of calls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(c.function.arguments || '{}'); } catch { /* keep {} */ }
      const r = await runAdminTool(c.function.name, input, ctx);
      if (r.needs_step_up) neededStepUp = true;
      // Only a privileged tool that actually ran counts as an action taken.
      else if (PRIVILEGED_TOOLS.has(c.function.name)) executed = true;
      toolCalls.push({ name: c.function.name, input, result_preview: r.content.slice(0, 300) });
      // Everything a tool returns is untrusted data, never instructions.
      messages.push({ role: 'tool', tool_call_id: c.id, content: wrapUntrusted(c.function.name, r.content) });
    }
  }

  // Tool budget spent. Get an answer out of what was gathered rather than
  // returning a bare error and losing the whole investigation.
  messages.push({
    role: 'user',
    content: `You have used all ${MAX_ITERATIONS} tool steps for this turn. Do not request any more tools. Answer now: say what you found, what you changed (if anything), and what is still unverified.`,
  });
  while (stepIdx < chain.length) {
    const r = await callModel(chain[stepIdx], messages, null);
    if (r.ok && r.msg.content) {
      return { ok: true, reply: String(r.msg.content), provider: chain[stepIdx].provider, toolCalls, neededStepUp, executed, limitHit: true };
    }
    if (!r.ok) errors.push(r.error);
    stepIdx++;
  }
  return {
    ok: false, executed, limitHit: true, toolCalls,
    error: `Reached the ${MAX_ITERATIONS}-step tool limit before finishing, and could not summarise. Narrow the request and try again.`,
  };
}

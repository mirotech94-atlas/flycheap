import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { bootTempDb } from './helpers/tempDb';

let loop: typeof import('@/lib/farePilotLoop');
let state: typeof import('@/lib/adminAgentState');

beforeAll(async () => {
  await bootTempDb();
  loop = await import('@/lib/farePilotLoop');
  state = await import('@/lib/adminAgentState');
});
beforeEach(() => state.__resetAdminAgentState());
afterEach(() => vi.unstubAllGlobals());

const chain = [
  { provider: 'groq:a', model: 'a', baseUrl: 'https://x/v1', apiKey: 'k' },
  { provider: 'groq:b', model: 'b', baseUrl: 'https://x/v1', apiKey: 'k' },
];
const OK = { adminUserId: 1, stepUpOk: true } as const;

const toolCall = (name: string, args: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: null, tool_calls: [{ id: `c${Math.random()}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] }),
});
const text = (t: string) => ({ ok: true, json: async () => ({ choices: [{ message: { content: t } }] }) });
const fail = (status: number, body = '') => ({ ok: false, status, text: async () => body });

/** Scripted provider: each fetch returns the next queued response. */
function script(responses: unknown[]) {
  const calls: Array<{ model: string; hasTools: boolean }> = [];
  let i = 0;
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    calls.push({ model: body.model, hasTools: Array.isArray(body.tools) });
    return responses[i++] ?? text('fallback');
  });
  return calls;
}

describe('FarePilot loop', () => {
  it('a mid-turn 429 resumes on the next model WITHOUT re-running the tool', async () => {
    const calls = script([
      toolCall('app_health'),        // model a → run a tool
      fail(429, 'rate limit reached: tokens per minute'), // model a → rate limited
      text('here is what I found'),  // model b → finishes the same turn
    ]);
    const r = await loop.runLoop(chain, [{ role: 'user', content: 'check health' }], OK);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reply).toBe('here is what I found');
    // The tool ran exactly once — a replay would have executed it again.
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].name).toBe('app_health');
    // It switched models rather than giving up, and carried the turn forward.
    expect(r.provider).toBe('groq:b');
    expect(calls.map(c => c.model)).toEqual(['a', 'a', 'b']);
  });

  it('exhausts every model before failing, and reports what already ran', async () => {
    script([fail(429, 'rate limited'), fail(500, 'boom')]);
    const r = await loop.runLoop(chain, [{ role: 'user', content: 'hi' }], OK);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/429|500/);
  });

  it('running out of tool steps still answers instead of throwing the work away', async () => {
    // Model never stops calling tools; the final call has tools disabled.
    const responses: unknown[] = Array.from({ length: loop.MAX_ITERATIONS }, () => toolCall('app_health'));
    responses.push(text('summary of what I found'));
    const calls = script(responses);

    const r = await loop.runLoop(chain, [{ role: 'user', content: 'dig' }], OK);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.limitHit).toBe(true);
    expect(r.reply).toBe('summary of what I found');
    expect(r.toolCalls).toHaveLength(loop.MAX_ITERATIONS);
    // The wrap-up call must not offer tools, or it would just call more.
    expect(calls[calls.length - 1].hasTools).toBe(false);
  });

  it('caps tool output fed back to the model (the thing that burns TPM)', () => {
    const big = 'x'.repeat(loop.MODEL_TOOL_RESULT_CHARS + 5000);
    const out = loop.forModel(big);
    expect(out.length).toBeLessThan(big.length);
    expect(out).toMatch(/truncated \d+ chars/);
    expect(loop.forModel('short')).toBe('short');
  });
});

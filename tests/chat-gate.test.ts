import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { bootTempDb } from './helpers/tempDb';

/**
 * /api/chat without a session: it must never reach a model (paid or free),
 * and it must be metered per client IP. Scope rules for signed-in callers are
 * pinned in concierge-scope.test.ts.
 */

beforeAll(async () => { await bootTempDb(); });

const saved = { ...process.env };
let outbound: string[] = [];
beforeEach(() => {
  outbound = [];
  vi.stubGlobal('fetch', async (u: unknown) => { outbound.push(String(u)); throw new Error('network disabled in tests'); });
});
afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); });

const ask = async (ip: string) => {
  const { POST } = await import('@/app/api/chat/route');
  return POST(new Request('https://my.flycheap.live/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'cheapest to Rome?' }] }),
  }));
};

describe('POST /api/chat without a session', () => {
  it('reaches no provider, paid or free', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENROUTER_API_KEY = 'or-test';
    process.env.GEMINI_API_KEY = 'gm-test';
    const res = await ask('203.0.113.7');
    expect(res.status).toBe(401);
    expect(outbound).toEqual([]);
  });

  it('is rate limited per client IP (last proxy hop, not the spoofable first)', async () => {
    let limited = 0;
    for (let i = 0; i < 40; i++) {
      // A rotating first hop must not reset the budget.
      const res = await ask(`10.0.0.${i}, 198.51.100.9`);
      if (res.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
    // A different client is unaffected.
    expect((await ask('198.51.100.77')).status).toBe(401);
  });
});

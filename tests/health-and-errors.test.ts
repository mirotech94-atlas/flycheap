import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { bootTempDb } from './helpers/tempDb';

beforeAll(async () => { await bootTempDb(); });
afterEach(() => { vi.doUnmock('@/lib/db'); vi.resetModules(); });

describe('GET /api/health (public)', () => {
  it('does not publish the build version', async () => {
    const { GET } = await import('@/app/api/health/route');
    const body = await (await GET()).json();
    expect(body).not.toHaveProperty('version');
    expect(body.ok === true || body.ok === false).toBe(true);
  });

  it('a database failure is reported generically, never with the raw error', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db', async (orig) => ({
      ...(await orig<typeof import('@/lib/db')>()),
      getDb: () => { throw new Error('SQLITE_CANTOPEN: unable to open /opt/egyptair-tracker/data/fares.db'); },
    }));
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toMatch(/SQLITE|\/opt\/|fares\.db/);
    expect(JSON.parse(text).checks.database.ok).toBe(false);
  });
});

describe('POST /api/v1/chat', () => {
  const leak = 'Incorrect API key provided: gsk_live_SECRET123 (request id req_abc) — org quota exceeded';
  const setup = async () => {
    vi.resetModules();
    vi.doMock('@/lib/mobileAuth', () => ({ apiAuthBearer: async () => ({ id: 1, email: 'u@x.com', tier: 'pro' }) }));
    vi.doMock('@/lib/ai/providers', async (orig) => ({
      ...(await orig<typeof import('@/lib/ai/providers')>()),
      buildProviderChain: () => [{ provider: 'groq:test', model: 'm', baseUrl: 'https://llm.invalid/v1', apiKey: 'k' }],
    }));
    vi.stubGlobal('fetch', async () => new Response(leak, { status: 401 }));
    return import('@/app/api/v1/chat/route');
  };
  const req = (q = '') => new Request(`https://my.flycheap.live/api/v1/chat${q}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  });
  afterEach(() => { vi.doUnmock('@/lib/mobileAuth'); vi.doUnmock('@/lib/ai/providers'); vi.unstubAllGlobals(); });

  it('never returns the raw provider error (JSON)', async () => {
    const { POST } = await setup();
    const res = await POST(req());
    const text = await res.text();
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(text).not.toMatch(/gsk_|req_abc|quota|401|groq/i);
  });

  it('never returns the raw provider error (stream)', async () => {
    const { POST } = await setup();
    const text = await (await POST(req('?stream=1'))).text();
    expect(text).not.toMatch(/gsk_|req_abc|quota|401|groq/i);
    expect(text.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from 'vitest';
import { groqChat } from '@/lib/groqChat';

function fakeFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  return (async (url: string, init: RequestInit) => {
    const { status, body } = handler(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    } as unknown as Response;
  }) as typeof fetch;
}

describe('groqChat', () => {
  it('posts the expected request shape and returns the content string', async () => {
    let captured: any = null;
    const fetchImpl = fakeFetch((url, init) => {
      captured = { url, headers: init.headers, body: JSON.parse(String(init.body)) };
      return { status: 200, body: { choices: [{ message: { content: 'hello there' } }] } };
    });

    const reply = await groqChat({
      apiKey: 'sekrit',
      model: 'openai/gpt-oss-20b',
      system: 'You are support.',
      messages: [{ role: 'user', content: 'how do alerts work?' }],
      maxTokens: 500,
      fetchImpl,
    });

    expect(reply).toBe('hello there');
    expect(captured.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(captured.headers.Authorization).toBe('Bearer sekrit');
    expect(captured.body).toEqual({
      model: 'openai/gpt-oss-20b',
      max_tokens: 500,
      messages: [
        { role: 'system', content: 'You are support.' },
        { role: 'user', content: 'how do alerts work?' },
      ],
    });
  });

  it('adds response_format json_object when json:true', async () => {
    let captured: any = null;
    const fetchImpl = fakeFetch((url, init) => {
      captured = JSON.parse(String(init.body));
      return { status: 200, body: { choices: [{ message: { content: '{}' } }] } };
    });
    await groqChat({
      apiKey: 'k', model: 'openai/gpt-oss-20b', system: 'Return JSON.',
      messages: [{ role: 'user', content: 'go' }], maxTokens: 200, json: true, fetchImpl,
    });
    expect(captured.response_format).toEqual({ type: 'json_object' });
  });

  it('sends reasoning_effort for gpt-oss models but not others', async () => {
    let body: any = null;
    const fetchImpl = fakeFetch((_url, init) => {
      body = JSON.parse(String(init.body));
      return { status: 200, body: { choices: [{ message: { content: 'ok' } }] } };
    });
    await groqChat({
      apiKey: 'k', model: 'openai/gpt-oss-120b', system: 's',
      messages: [], maxTokens: 100, reasoningEffort: 'low', fetchImpl,
    });
    expect(body.reasoning_effort).toBe('low');

    await groqChat({
      apiKey: 'k', model: 'llama-3.1-8b-instant', system: 's',
      messages: [], maxTokens: 100, reasoningEffort: 'low', fetchImpl,
    });
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('throws on a non-2xx response', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 401, body: 'unauthorized' }));
    await expect(groqChat({
      apiKey: 'bad', model: 'openai/gpt-oss-20b', system: 's', messages: [], maxTokens: 100, fetchImpl,
    })).rejects.toThrow(/^Groq 401: /);
  });

  it('retries a transient json_validate_failed 400 then succeeds', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false, status: 400,
          text: async () => '{"error":{"code":"json_validate_failed","failed_generation":""}}',
          json: async () => ({}),
        } as unknown as Response;
      }
      return {
        ok: true, status: 200, text: async () => '',
        json: async () => ({ choices: [{ message: { content: '{"body":"ok"}' } }] }),
      } as unknown as Response;
    }) as typeof fetch;
    const sleeps: number[] = [];
    const reply = await groqChat({
      apiKey: 'k', model: 'openai/gpt-oss-120b', system: 's', messages: [],
      maxTokens: 700, json: true, fetchImpl, sleep: async (ms) => { sleeps.push(ms); },
    });
    expect(calls).toBe(2);
    expect(reply).toBe('{"body":"ok"}');
    expect(sleeps).toEqual([500]);
  });

  it('switches to the fallback model on a daily-cap (TPD) 429', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const model = JSON.parse(String(init.body)).model as string;
      seen.push(model);
      if (model === 'openai/gpt-oss-120b') {
        return { ok: false, status: 429, text: async () => 'Rate limit reached … on tokens per day (TPD): Limit 200000', json: async () => ({}) } as unknown as Response;
      }
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: { content: 'from fallback' } }] }) } as unknown as Response;
    }) as typeof fetch;
    const reply = await groqChat({
      apiKey: 'k', model: 'openai/gpt-oss-120b', system: 's', messages: [], maxTokens: 100,
      fallbackModel: 'openai/gpt-oss-20b', fetchImpl,
    });
    expect(reply).toBe('from fallback');
    expect(seen).toEqual(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
  });

  it('throws when the daily cap is hit on the fallback model too', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 429, body: 'tokens per day (TPD): Limit 200000 reached' }));
    await expect(groqChat({
      apiKey: 'k', model: 'openai/gpt-oss-20b', system: 's', messages: [], maxTokens: 100,
      fallbackModel: 'openai/gpt-oss-20b', fetchImpl,
    })).rejects.toThrow(/daily token limit reached on all models/);
  });

  it('does not retry a non-json_validate 400', async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(() => { calls += 1; return { status: 400, body: 'bad request shape' }; });
    await expect(groqChat({
      apiKey: 'k', model: 'openai/gpt-oss-120b', system: 's', messages: [], maxTokens: 100, json: true, fetchImpl,
    })).rejects.toThrow(/^Groq 400: /);
    expect(calls).toBe(1);
  });

  it('retries once on 429 then succeeds, sleeping at least 20s', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          text: async () => 'Rate limit reached … Please try again in 35.115s.',
          json: async () => ({}),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ choices: [{ message: { content: 'hello again' } }] }),
      } as unknown as Response;
    }) as typeof fetch;

    const sleepCalls: number[] = [];
    const sleep = async (ms: number) => { sleepCalls.push(ms); };
    const reply = await groqChat({
      apiKey: 'k', model: 'openai/gpt-oss-20b', system: 's', messages: [], maxTokens: 100, fetchImpl, sleep,
    });

    expect(calls).toBe(2);
    expect(reply).toBe('hello again');
    expect(sleepCalls).toHaveLength(1);
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(20000);
  });

  it('throws after exhausting retries when every attempt hits 429', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return {
        ok: false,
        status: 429,
        text: async () => 'Please try again in 5s.',
        json: async () => ({}),
      } as unknown as Response;
    }) as typeof fetch;
    const sleep = async () => {};

    await expect(groqChat({
      apiKey: 'k', model: 'openai/gpt-oss-20b', system: 's', messages: [], maxTokens: 100, fetchImpl, sleep,
    })).rejects.toThrow(/^Groq 429: /);
    expect(calls).toBe(3);
  });
});

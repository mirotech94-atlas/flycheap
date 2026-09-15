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

  it('throws on a non-2xx response', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 401, body: 'unauthorized' }));
    await expect(groqChat({
      apiKey: 'bad', model: 'openai/gpt-oss-20b', system: 's', messages: [], maxTokens: 100, fetchImpl,
    })).rejects.toThrow(/^Groq 401: /);
  });
});

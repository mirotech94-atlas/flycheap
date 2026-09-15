import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { createGroqMessagesClient } from '@/lib/ops/groqClient';

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

describe('createGroqMessagesClient — request translation', () => {
  it('builds the exact OpenAI messages/tools JSON for a mixed conversation', async () => {
    let captured: any = null;
    const fetchImpl = fakeFetch((url, init) => {
      captured = { url, body: JSON.parse(String(init.body)) };
      return { status: 200, body: { id: 'x', choices: [{ message: { content: 'ok' } }], usage: {} } };
    });
    const client = createGroqMessagesClient({ apiKey: 'k', model: 'openai/gpt-oss-120b', fetchImpl });

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: 'claude-sonnet-5',
      max_tokens: 500,
      system: 'you are the ops agent',
      tools: [
        { name: 'read_logs', description: 'read logs', input_schema: { type: 'object', properties: { unit: { type: 'string' } }, required: ['unit'] } },
      ] as unknown as Anthropic.Tool[],
      messages: [
        { role: 'user', content: 'app is down' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'checking logs' },
            { type: 'tool_use', id: 'call_1', name: 'read_logs', input: { unit: 'egyptair' } },
          ],
        } as unknown as Anthropic.MessageParam,
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_1', content: 'log line 1\nlog line 2' },
          ],
        } as unknown as Anthropic.MessageParam,
      ],
    };

    await client.messages.create(params);

    expect(captured.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(captured.body).toEqual({
      model: 'openai/gpt-oss-120b',
      max_tokens: 500,
      messages: [
        { role: 'system', content: 'you are the ops agent' },
        { role: 'user', content: 'app is down' },
        {
          role: 'assistant',
          content: 'checking logs',
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'read_logs', arguments: JSON.stringify({ unit: 'egyptair' }) } },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'log line 1\nlog line 2' },
      ],
      tools: [
        { type: 'function', function: { name: 'read_logs', description: 'read logs', parameters: { type: 'object', properties: { unit: { type: 'string' } }, required: ['unit'] } } },
      ],
      tool_choice: 'auto',
    });
  });
});

describe('createGroqMessagesClient — response translation', () => {
  it('maps a text + tool_call choice to stop_reason tool_use', async () => {
    const fetchImpl = fakeFetch(() => ({
      status: 200,
      body: {
        id: 'chatcmpl-1',
        choices: [{
          message: {
            content: 'restarting now',
            tool_calls: [{ id: 'call_9', function: { name: 'restart_app', arguments: '{}' } }],
          },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    }));
    const client = createGroqMessagesClient({ apiKey: 'k', model: 'openai/gpt-oss-120b', fetchImpl });
    const res = await client.messages.create({ model: 'x', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] } as Anthropic.MessageCreateParamsNonStreaming);

    expect(res.stop_reason).toBe('tool_use');
    expect(res.content).toEqual([
      { type: 'text', text: 'restarting now', citations: null },
      { type: 'tool_use', id: 'call_9', name: 'restart_app', input: {}, caller: { type: 'direct' } },
    ]);
  });

  it('maps a text-only choice to stop_reason end_turn', async () => {
    const fetchImpl = fakeFetch(() => ({
      status: 200,
      body: { id: 'chatcmpl-2', choices: [{ message: { content: 'all good' } }], usage: {} },
    }));
    const client = createGroqMessagesClient({ apiKey: 'k', model: 'openai/gpt-oss-120b', fetchImpl });
    const res = await client.messages.create({ model: 'x', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] } as Anthropic.MessageCreateParamsNonStreaming);

    expect(res.stop_reason).toBe('end_turn');
    expect(res.content).toEqual([{ type: 'text', text: 'all good', citations: null }]);
  });

  it('throws with the status and body on a non-2xx response', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 500, body: 'internal server error, details omitted for the test but long enough to exceed three hundred characters so we can check truncation works as expected across the whole padded tail of this string which just keeps going and going and going and going and going and going and going and going' }));
    const client = createGroqMessagesClient({ apiKey: 'k', model: 'openai/gpt-oss-120b', fetchImpl });
    await expect(client.messages.create({ model: 'x', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] } as Anthropic.MessageCreateParamsNonStreaming))
      .rejects.toThrow(/^Groq 500: /);
  });
});

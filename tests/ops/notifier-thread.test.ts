import { describe, it, expect, beforeAll, vi } from 'vitest';
import { bootTempDb } from '../helpers/tempDb';

let db: Awaited<ReturnType<typeof bootTempDb>>;
beforeAll(async () => { db = await bootTempDb(); });

describe('notifier founder helpers', () => {
  it('founderChannelId reads the right settings', async () => {
    const n = await import('@/lib/notifier');
    db.queries.setSetting('alert_slack_admin_target', 'C1');
    db.queries.setSetting('alert_slack_target', 'C2');
    expect(n.founderChannelId('admin')).toBe('C1');
    expect(n.founderChannelId('client-mirror')).toBe('C2');
  });

  it('postToSlackThread sends thread_ts and returns the ts', async () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test';
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true, ts: '1.2' }), { status: 200 });
    }));
    const n = await import('@/lib/notifier');
    const r = await n.postToSlackThread('C1', '1.0', 'hello');
    expect(r).toMatchObject({ ok: true, id: '1.2' });
    expect(calls[0].url).toBe('https://slack.com/api/chat.postMessage');
    expect(calls[0].body).toMatchObject({ channel: 'C1', thread_ts: '1.0', text: 'hello', unfurl_links: false });
    vi.unstubAllGlobals();
  });
});

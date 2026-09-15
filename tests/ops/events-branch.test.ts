import { describe, it, expect } from 'vitest';
import { routeSlackMessage } from '@/lib/ops/route';

const ids = { admin: 'CADMIN', support: 'CSUP' };
const has = (ts: string) => ts === '100.1';

describe('routeSlackMessage', () => {
  it('human reply in an incident thread in #admin_alerts → ops', () => {
    expect(routeSlackMessage({ channel: 'CADMIN', thread_ts: '100.1', ts: '100.2', text: 'go' }, ids, has)).toBe('ops');
  });
  it('root messages and non-incident threads in #admin_alerts are ignored', () => {
    expect(routeSlackMessage({ channel: 'CADMIN', ts: '101.0', text: 'hi' }, ids, has)).toBe('ignore');
    expect(routeSlackMessage({ channel: 'CADMIN', thread_ts: '999.9', ts: '999.10', text: 'hi' }, ids, has)).toBe('ignore');
  });
  it('bot and subtype messages are ignored everywhere', () => {
    expect(routeSlackMessage({ channel: 'CADMIN', thread_ts: '100.1', ts: '100.3', text: 'x', bot_id: 'B1' }, ids, has)).toBe('ignore');
    expect(routeSlackMessage({ channel: 'CSUP', ts: '1.0', text: 'x', subtype: 'message_changed' }, ids, has)).toBe('ignore');
  });
  it('support channel humans → support (unchanged behaviour)', () => {
    expect(routeSlackMessage({ channel: 'CSUP', ts: '1.0', text: 'help' }, ids, has)).toBe('support');
  });
});

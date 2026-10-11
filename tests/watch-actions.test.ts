import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useTempDb } from './helpers/tempDb';
import { toWatch, computeExpiry, hasExpired } from '@/lib/watch';

/**
 * The home-route flag and the per-watch channel override.
 *
 * Both were read by the engine from the day they were written and could not be
 * SET by anything — computeExpiry() and hasExpired() have always honoured
 * is_home_route, and alertGate has always read search.alert_channels. The spec
 * calls the home route "the headline retention lever", and it was unreachable.
 */

let db: typeof import('@/lib/db');
let gate: typeof import('@/lib/alertGate');

beforeAll(async () => {
  useTempDb();
  db = await import('@/lib/db');
  gate = await import('@/lib/alertGate');
  db.getDb();
  db.getDb().prepare(
    `INSERT OR REPLACE INTO users (id, email, name, tier) VALUES (1, 'u@example.test', 'U', 'pro')`,
  ).run();
});

beforeEach(() => {
  db.getDb().prepare('DELETE FROM searches').run();
  db.getDb().prepare('DELETE FROM user_settings WHERE user_id = 1').run();
  db.getDb().prepare(
    `INSERT INTO searches (id, origin, destination, depart_date, return_date, adults, infants, active, user_id)
     VALUES (1, 'JFK', 'CAI', '2026-12-01', '2026-12-15', 1, 0, 1, 1)`,
  ).run();
});

const row = () => db.queries.getSearchById(1)!;

describe('a home route never expires', () => {
  it('an ordinary watch does expire after its dates pass', () => {
    const w = toWatch({ ...row(), depart_date: '2026-01-01', return_date: '2026-01-10' });
    expect(computeExpiry(w)).not.toBeNull();
    expect(hasExpired(w, Date.parse('2026-09-20T00:00:00Z'))).toBe(true);
  });

  it('a home route does not, however old the dates are', () => {
    db.getDb().prepare('UPDATE searches SET is_home_route = 1 WHERE id = 1').run();
    const w = toWatch({ ...row(), depart_date: '2026-01-01', return_date: '2026-01-10' });
    expect(w.isHomeRoute).toBe(true);
    expect(computeExpiry(w)).toBeNull();
    expect(hasExpired(w, Date.parse('2030-01-01T00:00:00Z'))).toBe(false);
  });

  it('reads the column through SearchRow rather than a cast', () => {
    // The columns are added by migration and were missing from the type, so
    // every reader had to cast — which is why the board could not read them.
    db.getDb().prepare('UPDATE searches SET is_home_route = 1, alert_channels = ? WHERE id = 1').run('sms');
    const r = row();
    expect(r.is_home_route).toBe(1);
    expect(r.alert_channels).toBe('sms');
  });
});

describe('a per-watch channel override can only narrow', () => {
  const decide = () => gate.gateAlert({
    kind: 'threshold', search: row(), ownerUserId: 1,
    now: new Date(Date.UTC(2026, 8, 21, 18, 0, 0)),
  });

  it('makes one route louder than the account default', () => {
    // "The home route to see family gets Telegram; the speculative Tokyo
    //  budget watch gets digest."
    //
    // This used to say SMS. SMS is gone with Twilio, so the example moved to a
    // channel that can actually deliver — which is the same rule the test
    // below enforces, applied to the test itself.
    db.queries.setUserSetting(1, 'alert_channels', 'email,telegram');
    db.getDb().prepare('UPDATE searches SET alert_channels = ? WHERE id = 1').run('telegram');
    const d = decide();
    expect(d.send && d.channels).toEqual(['telegram']);
  });

  it('cannot conjure a channel the account has not configured', () => {
    db.queries.setUserSetting(1, 'alert_channels', 'email');
    db.getDb().prepare('UPDATE searches SET alert_channels = ? WHERE id = 1').run('sms,telegram');
    const d = decide();
    expect(d.send).toBe(false);
    expect(d.send === false && d.reason).toMatch(/no channel/i);
  });

  it('falls back to the account default when the watch sets none', () => {
    db.queries.setUserSetting(1, 'alert_channels', 'email,telegram');
    db.getDb().prepare('UPDATE searches SET alert_channels = NULL WHERE id = 1').run();
    const d = decide();
    expect(d.send && d.channels).toEqual(['email', 'telegram']);
  });
});

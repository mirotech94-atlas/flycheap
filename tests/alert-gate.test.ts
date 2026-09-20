import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useTempDb } from './helpers/tempDb';

/**
 * The adapter between the settings a user saves and the policy that runs.
 *
 * Every test here is about a way alerts can go silently missing, which is the
 * failure this codebase has been bitten by more than once.
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
  db.getDb().prepare(
    `INSERT OR REPLACE INTO searches (id, origin, destination, depart_date, return_date, adults, infants, active, user_id)
     VALUES (1, 'JFK', 'CAI', '2026-12-01', '2026-12-15', 1, 0, 1, 1)`,
  ).run();
});

beforeEach(() => {
  db.getDb().prepare('DELETE FROM user_settings WHERE user_id = 1').run();
});

const search = () => db.queries.getSearchById(1)!;
/** tz_offset_min -240, so 07:00 UTC is 03:00 local and 18:00 UTC is 14:00. */
const at = (utcHour: number) => new Date(Date.UTC(2026, 8, 21, utcHour, 0, 0));
const decide = (kind: Parameters<typeof gate.gateAlert>[0]['kind'], utcHour: number) =>
  gate.gateAlert({ kind, search: search(), ownerUserId: 1, now: at(utcHour) });

describe('quiet hours: absent, empty and set are three different answers', () => {
  it('applies no window when the timezone is unknown', () => {
    // A 22:00-08:00 window against UTC silences a US user from 6pm.
    expect(decide('threshold', 7).send).toBe(true);
  });

  it('applies the DEFAULT window once the timezone is known', () => {
    db.queries.setUserSetting(1, 'tz_offset_min', '-240');
    expect(decide('threshold', 7).send).toBe(false);    // 03:00 local
    expect(decide('threshold', 18).send).toBe(true);    // 14:00 local
  });

  it('CLEARING quiet hours really clears them', () => {
    // The regression: empty was treated as "not configured", so it fell back to
    // the default and the Clear button left the window in force — alerts held
    // overnight by a setting the user had just switched off, while the card
    // showed "Not set". Only reachable once the UI began capturing timezones.
    db.queries.setUserSetting(1, 'tz_offset_min', '-240');
    db.queries.setUserSetting(1, 'quiet_hours_start', '');
    db.queries.setUserSetting(1, 'quiet_hours_end', '');
    expect(decide('threshold', 7).send).toBe(true);
  });

  it('honours a window the user actually set', () => {
    db.queries.setUserSetting(1, 'tz_offset_min', '-240');
    db.queries.setUserSetting(1, 'quiet_hours_start', '01:00');
    db.queries.setUserSetting(1, 'quiet_hours_end', '05:00');
    expect(decide('threshold', 7).send).toBe(false);    // 03:00 local, inside
    expect(decide('threshold', 11).send).toBe(true);    // 07:00 local, outside
  });

  it('treats a malformed window as OFF rather than defaulting', () => {
    // Falling back to the default here would hold alerts because of a typo.
    db.queries.setUserSetting(1, 'tz_offset_min', '-240');
    db.queries.setUserSetting(1, 'quiet_hours_start', 'garbage');
    db.queries.setUserSetting(1, 'quiet_hours_end', 'garbage');
    expect(decide('threshold', 7).send).toBe(true);
  });
});

describe('the mistake-fare exception', () => {
  beforeEach(() => {
    db.queries.setUserSetting(1, 'tz_offset_min', '-240');
    db.queries.setUserSetting(1, 'quiet_hours_start', '22:00');
    db.queries.setUserSetting(1, 'quiet_hours_end', '08:00');
  });

  it('stays quiet at 3am unless the user opted in', () => {
    expect(decide('mistake-fare', 7).send).toBe(false);
  });

  it('wakes them when they did', () => {
    db.queries.setUserSetting(1, 'wake_for_mistake_fares', 'true');
    expect(decide('mistake-fare', 7).send).toBe(true);
  });

  it('never lets anything else through, even with the opt-in on', () => {
    db.queries.setUserSetting(1, 'wake_for_mistake_fares', 'true');
    for (const kind of ['threshold', 'post-booking-drop', 'anomaly'] as const) {
      expect(decide(kind, 7).send).toBe(false);
    }
  });
});

describe('digest and the cap', () => {
  it('holds everything but a closing window when instant is off', () => {
    db.queries.setUserSetting(1, 'instant_alerts', 'false');
    expect(decide('threshold', 18).send).toBe(false);
    // window-closing prevents the worst outcome in the product: someone who
    // waited on our advice and paid more.
    expect(decide('window-closing', 18).send).toBe(true);
  });

  it('leaves existing accounts on instant when the setting is absent', () => {
    expect(decide('threshold', 18).send).toBe(true);
  });

  it('respects a cap the user chose', () => {
    db.queries.setUserSetting(1, 'daily_alert_cap', '1');
    db.getDb().prepare(
      `INSERT INTO alerts_sent (search_id, fare_snapshot_id, price_per_adult_usd, kind, status, sent_at)
       VALUES (1, 1, 700, 'threshold', 'sent', datetime('now'))`,
    ).run();
    expect(decide('threshold', 18).send).toBe(false);
    // ...but never for a mistake fare. A cap that swallowed the one alert worth
    // $400 would be the most expensive setting in the product.
    expect(decide('mistake-fare', 18).send).toBe(true);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { useTempDb } from './helpers/tempDb';
import {
  verifySvixSignature, signSvixPayload, DEFAULT_TOLERANCE_SEC,
} from '@/lib/webhookSignature';

/**
 * A webhook endpoint is a URL anyone on the internet can POST to. If the
 * signature check is wrong, anyone can mark alerts as delivered and opened — and
 * the funnel numbers this exists to produce become fiction that looks exactly
 * like data. So this is tested from the attacker's side, not just the happy one.
 */

const SECRET = 'whsec_' + Buffer.from('a-test-signing-secret-32-bytes!!').toString('base64');
const NOW = Date.parse('2026-09-20T12:00:00Z');
const TS = String(Math.floor(NOW / 1000));
const ID = 'msg_2abc';
const PAYLOAD = JSON.stringify({ type: 'email.delivered', data: { email_id: 'em_1' } });

const good = () => signSvixPayload({ payload: PAYLOAD, svixId: ID, svixTimestamp: TS, secret: SECRET });

const verify = (over: Partial<Parameters<typeof verifySvixSignature>[0]> = {}) =>
  verifySvixSignature({
    payload: PAYLOAD, svixId: ID, svixTimestamp: TS,
    svixSignature: good(), secret: SECRET, nowMs: NOW, ...over,
  });

describe('accepting a genuine webhook', () => {
  it('accepts a correctly signed payload', () => {
    expect(verify()).toEqual({ ok: true });
  });

  it('accepts when several signatures are present, as during a secret rotation', () => {
    const other = signSvixPayload({
      payload: PAYLOAD, svixId: ID, svixTimestamp: TS,
      secret: 'whsec_' + Buffer.from('some-other-secret-value-here!!!!').toString('base64'),
    });
    expect(verify({ svixSignature: `${other} ${good()}` })).toEqual({ ok: true });
  });
});

describe('rejecting a forged one', () => {
  it('rejects a payload that was altered after signing', () => {
    // The whole point: an attacker who changes email_id to a different alert
    // must not be able to mark it opened.
    const tampered = JSON.stringify({ type: 'email.opened', data: { email_id: 'em_HIJACKED' } });
    expect(verify({ payload: tampered }).ok).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    const forged = signSvixPayload({
      payload: PAYLOAD, svixId: ID, svixTimestamp: TS,
      secret: 'whsec_' + Buffer.from('attacker-controlled-secret-val!!').toString('base64'),
    });
    expect(verify({ svixSignature: forged }).ok).toBe(false);
  });

  it('rejects a signature bound to a different message id', () => {
    // The id is part of the signed content, so replaying one event's signature
    // onto another event fails.
    const otherId = signSvixPayload({
      payload: PAYLOAD, svixId: 'msg_different', svixTimestamp: TS, secret: SECRET,
    });
    expect(verify({ svixSignature: otherId }).ok).toBe(false);
  });

  it('rejects an old capture replayed outside the tolerance window', () => {
    const old = String(Math.floor(NOW / 1000) - DEFAULT_TOLERANCE_SEC - 5);
    expect(verify({
      svixTimestamp: old,
      svixSignature: signSvixPayload({ payload: PAYLOAD, svixId: ID, svixTimestamp: old, secret: SECRET }),
    }).ok).toBe(false);
  });

  it('accepts inside the tolerance window, including clock skew the other way', () => {
    for (const delta of [-60, 60]) {
      const ts = String(Math.floor(NOW / 1000) + delta);
      expect(verify({
        svixTimestamp: ts,
        svixSignature: signSvixPayload({ payload: PAYLOAD, svixId: ID, svixTimestamp: ts, secret: SECRET }),
      })).toEqual({ ok: true });
    }
  });

  it('refuses everything when no secret is configured, rather than falling open', () => {
    // An endpoint that accepts unsigned requests because it was not set up is
    // worse than one that is missing — the dashboard fills with unverified data.
    expect(verify({ secret: '' }).ok).toBe(false);
  });

  it('rejects missing headers rather than skipping the check', () => {
    expect(verify({ svixSignature: null }).ok).toBe(false);
    expect(verify({ svixId: null }).ok).toBe(false);
    expect(verify({ svixTimestamp: null }).ok).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    expect(verify({ svixTimestamp: 'not-a-number' }).ok).toBe(false);
    expect(verify({ svixSignature: 'garbage' }).ok).toBe(false);
    expect(verify({ svixSignature: 'v2,abc' }).ok).toBe(false);  // unknown version
    expect(verify({ secret: 'whsec_' }).ok).toBe(false);          // decodes empty
  });
});

describe('applying events to alerts', () => {
  let dbmod: typeof import('@/lib/db');

  beforeAll(async () => {
    useTempDb();
    dbmod = await import('@/lib/db');
    dbmod.getDb();
    const db = dbmod.getDb();
    db.prepare(
      `INSERT INTO alerts_sent (id, search_id, fare_snapshot_id, price_per_adult_usd, status, message_id)
       VALUES (901, 1, 1, 484, 'sent', 'em_join')`,
    ).run();
  });

  const evt = (over: Record<string, unknown> = {}) => ({
    event_id: `ev_${Math.random()}`,
    event_type: 'email.delivered',
    message_id: 'em_join',
    recipient: 'a@b.c',
    occurred_at: '2026-09-20 12:00:00',
    raw_json: '{}',
    ...over,
  });

  it('marks the alert delivered', () => {
    const r = dbmod.queries.recordEmailEvent(evt());
    expect(r.applied).toBe(true);
    const row = dbmod.getDb().prepare('SELECT delivered_at FROM alerts_sent WHERE id = 901').get() as { delivered_at: string | null };
    expect(row.delivered_at).toBe('2026-09-20 12:00:00');
  });

  it('ignores a retry of the same event', () => {
    // ESPs retry on any non-2xx. The same delivery must not be counted twice.
    const e = evt({ event_id: 'ev_fixed' });
    expect(dbmod.queries.recordEmailEvent(e).duplicate).toBe(false);
    expect(dbmod.queries.recordEmailEvent(e).duplicate).toBe(true);
    const n = dbmod.getDb().prepare(`SELECT COUNT(*) AS n FROM email_events WHERE event_id = 'ev_fixed'`).get() as { n: number };
    expect(n.n).toBe(1);
  });

  it('keeps the FIRST timestamp when events arrive out of order', () => {
    dbmod.queries.recordEmailEvent(evt({ occurred_at: '2026-09-20 18:00:00' }));
    const row = dbmod.getDb().prepare('SELECT delivered_at FROM alerts_sent WHERE id = 901').get() as { delivered_at: string };
    expect(row.delivered_at).toBe('2026-09-20 12:00:00');
  });

  it('stores an event about a message we never sent, without applying it', () => {
    // Chain sends and digests also produce webhooks. Keeping the raw row means a
    // mis-parse is recoverable; not applying it keeps the alert numbers honest.
    const r = dbmod.queries.recordEmailEvent(evt({ message_id: 'em_unknown' }));
    expect(r.applied).toBe(false);
    expect(r.duplicate).toBe(false);
  });

  it('records opens and bounces on their own columns', () => {
    dbmod.queries.recordEmailEvent(evt({ event_type: 'email.opened', occurred_at: '2026-09-20 13:00:00' }));
    dbmod.queries.recordEmailEvent(evt({ event_type: 'email.bounced', occurred_at: '2026-09-20 14:00:00' }));
    const row = dbmod.getDb().prepare('SELECT opened_at, bounced_at FROM alerts_sent WHERE id = 901').get() as Record<string, string>;
    expect(row.opened_at).toBe('2026-09-20 13:00:00');
    expect(row.bounced_at).toBe('2026-09-20 14:00:00');
  });
});

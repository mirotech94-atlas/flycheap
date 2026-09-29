import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { bootTempDb } from './helpers/tempDb';

/**
 * Webhook endpoints are URLs anyone can POST to. Each one here must refuse a
 * forged or replayed call, and must refuse outright when the secret that
 * would prove authenticity is not configured.
 */

let db: Awaited<ReturnType<typeof bootTempDb>>;
beforeAll(async () => { db = await bootTempDb(); });
const saved = { ...process.env };
// No test here may reach the network: any outbound fetch is recorded and fails.
let outbound: string[] = [];
beforeEach(() => {
  outbound = [];
  vi.stubGlobal('fetch', async (u: unknown) => { outbound.push(String(u)); throw new Error('network disabled in tests'); });
});
afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); });

describe('Twilio signature', () => {
  it('matches Twilio’s published example vector', async () => {
    const { twilioSignature } = await import('@/lib/twilioSignature');
    const params = { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' };
    expect(twilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', params)).toBe('0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
  });

  it('verifies only the exact url + params + token', async () => {
    const { twilioSignature, verifyTwilioSignature } = await import('@/lib/twilioSignature');
    const url = 'https://my.flycheap.live/api/twilio/incoming';
    const params = { From: '+15550100', Body: 'STOP' };
    const sig = twilioSignature('tok', url, params);
    expect(verifyTwilioSignature({ authToken: 'tok', url, params, signature: sig })).toBe(true);
    expect(verifyTwilioSignature({ authToken: 'tok', url, params: { ...params, Body: 'START' }, signature: sig })).toBe(false);
    expect(verifyTwilioSignature({ authToken: 'tok', url: url + '?x=1', params, signature: sig })).toBe(false);
    expect(verifyTwilioSignature({ authToken: 'other', url, params, signature: sig })).toBe(false);
    expect(verifyTwilioSignature({ authToken: 'tok', url, params, signature: null })).toBe(false);
    expect(verifyTwilioSignature({ authToken: '', url, params, signature: sig })).toBe(false);
  });
});

describe('POST /api/twilio/incoming', () => {
  const URL_ = 'https://my.flycheap.live/api/twilio/incoming';
  const post = async (fields: Record<string, string>, sig: string | null) => {
    const { POST } = await import('@/app/api/twilio/incoming/route');
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
    if (sig) headers['x-twilio-signature'] = sig;
    return POST(new Request(URL_, { method: 'POST', body: new URLSearchParams(fields), headers }));
  };

  it('a forged STOP is refused and changes nothing', async () => {
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    process.env.TWILIO_WEBHOOK_URL = URL_;
    const uid = Number(db.getDb().prepare("INSERT INTO users (email) VALUES ('sms@x.com')").run().lastInsertRowid);
    db.queries.setUserSetting(uid, 'sms_phone', '+15550100');
    db.queries.setUserSetting(uid, 'sms_opt_in', 'true');
    const res = await post({ From: '+15550100', Body: 'STOP' }, 'bogus');
    expect(res.status).toBe(403);
    expect(db.queries.getUserSetting(uid, 'sms_opt_in')).toBe('true');

    const { twilioSignature } = await import('@/lib/twilioSignature');
    const ok = await post({ From: '+15550100', Body: 'STOP' }, twilioSignature('tok', URL_, { From: '+15550100', Body: 'STOP' }));
    expect(ok.status).toBe(200);
    expect(db.queries.getUserSetting(uid, 'sms_opt_in')).toBe('false');
  });

  it('with TWILIO_WEBHOOK_URL set but no auth token, refuses (fail closed)', async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_WEBHOOK_URL = URL_;
    const res = await post({ From: '+15550100', Body: 'HELP' }, 'anything');
    expect(res.status).toBe(403);
  });

  it('inert until TWILIO_WEBHOOK_URL is set: accepts as before, warning once', async () => {
    delete process.env.TWILIO_WEBHOOK_URL;
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const uid = Number(db.getDb().prepare("INSERT INTO users (email) VALUES ('sms-inert@x.com')").run().lastInsertRowid);
    db.queries.setUserSetting(uid, 'sms_phone', '+15550199');
    db.queries.setUserSetting(uid, 'sms_opt_in', 'true');
    expect((await post({ From: '+15550199', Body: 'STOP' }, null)).status).toBe(200);
    expect(db.queries.getUserSetting(uid, 'sms_opt_in')).toBe('false');
    expect((await post({ From: '+15550199', Body: 'HELP' }, null)).status).toBe(200);
    expect(warn.mock.calls.filter(c => String(c[0]).includes('TWILIO_WEBHOOK_URL'))).toHaveLength(1);
    warn.mockRestore();
  });
});

describe('POST /api/telegram/webhook', () => {
  const call = async (headers: Record<string, string>, query = '') => {
    const { POST } = await import('@/app/api/telegram/webhook/route');
    return POST(new Request(`https://my.flycheap.live/api/telegram/webhook${query}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ update_id: 1 }),
    }));
  };

  it('inert until TELEGRAM_WEBHOOK_SECRET is set: accepts as before, warning once', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await call({})).status).toBe(200);
    expect((await call({})).status).toBe(200);
    expect(warn.mock.calls.filter(c => String(c[0]).includes('TELEGRAM_WEBHOOK_SECRET'))).toHaveLength(1);
    warn.mockRestore();
  });

  it('refuses a wrong or missing secret header, accepts the right one', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 's3cret-token';
    expect((await call({})).status).toBe(403);
    expect((await call({ 'x-telegram-bot-api-secret-token': 's3cret-tokeX' })).status).toBe(403);
    expect((await call({ 'x-telegram-bot-api-secret-token': 's3cret' })).status).toBe(403);
    expect((await call({ 'x-telegram-bot-api-secret-token': 's3cret-token' })).status).toBe(200);
  });

  it('?action=setWebhook is not an anonymous way to repoint the bot', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_BOT_TOKEN = '123:abc';
    const res = await call({ 'x-forwarded-host': 'evil.example' }, '?action=setWebhook');
    expect(res.status).toBe(403);
    expect(outbound).toEqual([]); // Telegram was never asked to repoint
  });
});

describe('POST /api/billing/webhook (Stripe)', () => {
  const SECRET = 'whsec_test_dedupe';
  const signed = (payload: string) => {
    const t = Math.floor(Date.now() / 1000);
    const v1 = crypto.createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex');
    return `t=${t},v1=${v1}`;
  };
  const deliver = async (payload: string) => {
    const { POST } = await import('@/app/api/billing/webhook/route');
    const { NextRequest } = await import('next/server');
    return POST(new NextRequest('https://my.flycheap.live/api/billing/webhook', {
      method: 'POST', body: payload, headers: { 'stripe-signature': signed(payload) },
    }));
  };

  it('processes an event id once; a redelivery is acknowledged but not re-applied', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const uid = Number(db.getDb().prepare("INSERT INTO users (email) VALUES ('stripe-dedupe@x.com')").run().lastInsertRowid);
    const payload = JSON.stringify({
      id: 'evt_dedupe_1', type: 'checkout.session.completed',
      data: { object: { client_reference_id: String(uid), customer: 'cus_test', subscription: 'sub_test', metadata: { plan: 'pro' } } },
    });
    const first = await deliver(payload);
    expect(first.status).toBe(200);
    expect(db.queries.getUserById(uid)?.tier).toBe('pro');

    db.queries.setUserTier(uid, 'free', 'canceled', null); // e.g. a later cancellation
    const replay = await deliver(payload);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ duplicate: true });
    expect(db.queries.getUserById(uid)?.tier).toBe('free'); // not re-upgraded
  });

  it('a replayed period-end cancellation is not re-applied after the user resubscribes', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const uid = Number(db.getDb().prepare("INSERT INTO users (email, tier) VALUES ('stripe-period@x.com','pro')").run().lastInsertRowid);
    const payload = JSON.stringify({
      id: 'evt_period_end_1', type: 'customer.subscription.updated',
      data: { object: { id: 'sub_p', customer: 'cus_p', status: 'active', cancel_at_period_end: true,
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 10, metadata: { user_id: String(uid), plan: 'pro' } } },
    });
    expect((await deliver(payload)).status).toBe(200);
    expect(db.queries.getUserById(uid)?.subscription_status).toBe('cancel_at_period_end');

    db.queries.setUserTier(uid, 'pro', 'active', null); // they changed their mind
    const replay = await deliver(payload);
    expect(await replay.json()).toMatchObject({ duplicate: true });
    expect(db.queries.getUserById(uid)?.subscription_status).toBe('active');
  });
});

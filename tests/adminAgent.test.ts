import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { bootTempDb } from './helpers/tempDb';
import * as totp from '@/lib/totp';
import * as state from '@/lib/adminAgentState';
import { sameOriginOk, clientIp, adminHostOk } from '@/lib/adminGuard';

let db: Awaited<ReturnType<typeof bootTempDb>>;
let tools: typeof import('@/lib/adminAgentTools');
const OK = { adminUserId: 1, stepUpOk: true } as const;
const NOSTEP = { adminUserId: 1, stepUpOk: false } as const;
const H = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });

beforeAll(async () => { db = await bootTempDb(); tools = await import('@/lib/adminAgentTools'); });
beforeEach(() => state.__resetAdminAgentState());

describe('FarePilot tools + gate', () => {
  it('by default (owner turned step-up OFF) SQL/shell run with no authenticator code', async () => {
    await tools.runAdminTool('sql_query', { sql: "INSERT INTO users (email, tier) VALUES ('t@example.com','pro')" }, OK);
    expect((await tools.runAdminTool('find_client', { query: 't@example' }, NOSTEP)).content).toContain('t@example.com');
    // NOSTEP = no step-up granted; the write should still execute now.
    const email = `nocode-${Date.now()}@x.com`;
    const r = await tools.runAdminTool('sql_query', { sql: `INSERT INTO users (email) VALUES ('${email}')` }, NOSTEP);
    expect(r.needs_step_up).toBeFalsy();
    expect(r.is_error).toBeFalsy();
    const n = (db.getDb().prepare('SELECT COUNT(*) n FROM users WHERE email = ?').get(email) as { n: number }).n;
    expect(n).toBe(1); // it actually ran, with no authenticator code
  });

  it('FAREPILOT_REQUIRE_STEPUP=1 puts the code gate back: refuses and runs nothing', async () => {
    process.env.FAREPILOT_REQUIRE_STEPUP = '1';
    vi.resetModules();
    const gated = await import('@/lib/adminAgentTools');
    try {
      const before = (db.getDb().prepare("SELECT COUNT(*) n FROM users WHERE email='inject@x.com'").get() as { n: number }).n;
      const s = await gated.runAdminTool('sql_query', { sql: "INSERT INTO users (email) VALUES ('inject@x.com')" }, NOSTEP);
      expect(s.needs_step_up).toBe(true);
      expect((await gated.runAdminTool('run_command', { command: 'echo nope' }, NOSTEP)).needs_step_up).toBe(true);
      const after = (db.getDb().prepare("SELECT COUNT(*) n FROM users WHERE email='inject@x.com'").get() as { n: number }).n;
      expect(after).toBe(before);
    } finally {
      delete process.env.FAREPILOT_REQUIRE_STEPUP;
      vi.resetModules();
    }
  });

  it('sql_query redacts secrets by column AND by value shape (F3)', async () => {
    db.getDb().prepare("UPDATE users SET totp_secret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', stripe_customer_id='cus_ABC123XYZ' WHERE id=1").run();
    // aliased column name dodges the name check; value-shape must still catch it
    const r = await tools.runAdminTool('sql_query', { sql: "SELECT totp_secret AS x, stripe_customer_id AS y FROM users WHERE id=1" }, OK);
    expect(r.content).not.toContain('JBSWY3DPEHPK3PXP');
    expect(r.content).not.toContain('cus_ABC123XYZ');
    expect(r.content).toContain('[redacted]');
  });

  it('rate limit trips after the cap', async () => {
    let blocked = false;
    for (let i = 0; i < 40; i++) if ((await tools.runAdminTool('run_command', { command: 'echo x' }, OK)).content.includes('Rate limit')) { blocked = true; break; }
    expect(blocked).toBe(true);
  });

  it('audit writes a running row before execution then updates it (I1)', () => {
    const id = db.queries.logAdminAgentActionStart({ adminUserId: 1, tool: 'run_command', input: '{}' });
    expect((db.getDb().prepare('SELECT result_preview FROM admin_agent_audit WHERE id=?').get(id) as { result_preview: string }).result_preview).toBe('(running)');
    db.queries.updateAdminAgentAction(id, 'done', false);
    expect((db.getDb().prepare('SELECT ok FROM admin_agent_audit WHERE id=?').get(id) as { ok: number }).ok).toBe(0);
  });
});

describe('in-memory state (C3, F2, F6)', () => {
  it('step-up is in memory; the admin_stepup table is dropped (F9)', () => {
    state.recordStepUp('sess-1');
    expect(state.stepUpValid('sess-1')).toBe(true);
    expect(state.stepUpValid('other')).toBe(false);
    expect(db.getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_stepup'").get()).toBeUndefined();
  });

  it('rejects a replayed code per-user, not per-session (F6)', () => {
    expect(state.isCodeConsumed(1, '222222')).toBe(false);
    state.consumeCode(1, '222222');
    expect(state.isCodeConsumed(1, '222222')).toBe(true);
    expect(state.isCodeConsumed(2, '222222')).toBe(false); // different user
    expect(state.isCodeConsumed(1, '333333')).toBe(false);
  });

  it('brute-force limiter blocks after 5 attempts (C1)', () => {
    for (let i = 0; i < 5; i++) { expect(state.verifyAllowed('k')).toBe(true); state.recordVerifyAttempt('k'); }
    expect(state.verifyAllowed('k')).toBe(false);
  });

  it('a fresh TOTP code verifies; a stale one does not', () => {
    const secret = totp.generateSecret(); const now = Date.now();
    expect(totp.verify(secret, totp.generate(secret, now), 1, now)).toBe(true);
    expect(totp.verify(secret, totp.generate(secret, now - 120_000), 1, now)).toBe(false);
  });
});

describe('request guard (B3, F1)', () => {
  it('same-origin gate fails closed on cross-origin Origin even without Sec-Fetch-Site (B3)', () => {
    const host = 'admin.flycheap.18dn.com';
    expect(sameOriginOk(H({ host, origin: 'https://evil.com' }))).toBe(false);          // cross Origin, no site
    expect(sameOriginOk(H({ host, origin: `https://${host}` }))).toBe(true);            // same Origin
    expect(sameOriginOk(H({ host, 'sec-fetch-site': 'cross-site' }))).toBe(false);      // cross site
    expect(sameOriginOk(H({ host, 'sec-fetch-site': 'same-origin' }))).toBe(true);      // same site
    expect(sameOriginOk(H({ host }))).toBe(true);                                       // both absent -> allow
  });

  it('clientIp uses the LAST forwarded hop, not the client-controlled first (F1)', () => {
    expect(clientIp(H({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 9.9.9.9' }))).toBe('9.9.9.9');
    expect(clientIp(H({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8');
  });
});

describe('app_health error recency (stops chasing stale errors)', () => {
  it('reports no live errors when the newest is hours old, and flags fresh ones', async () => {
    const db2 = db.getDb();
    db2.prepare('DELETE FROM error_log').run();

    // empty log
    let r = await tools.runAdminTool('app_health', {}, NOSTEP);
    expect(r.content).toMatch(/error_log is empty/);

    // an old error (20h ago) must read as resolved, not a live incident
    db2.prepare("INSERT INTO error_log (occurred_at, level, source, message) VALUES (datetime('now','-20 hours'),'error','process','Failed to load chunk x')").run();
    r = await tools.runAdminTool('app_health', {}, NOSTEP);
    expect(r.content).toMatch(/No errors in the last hour/);
    expect(r.content).toMatch(/already resolved/);
    expect(r.content).toContain('"in_last_1h": 0');

    // a fresh error must read as live
    db2.prepare("INSERT INTO error_log (occurred_at, level, source, message) VALUES (datetime('now','-2 minutes'),'error','chat','boom')").run();
    r = await tools.runAdminTool('app_health', {}, NOSTEP);
    expect(r.content).toMatch(/LAST HOUR — this is live/);
    expect(r.content).toContain('"in_last_1h": 1');
  });
});

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { bootTempDb } from './helpers/tempDb';
import * as totp from '@/lib/totp';
import * as state from '@/lib/adminAgentState';

let db: Awaited<ReturnType<typeof bootTempDb>>;
let tools: typeof import('@/lib/adminAgentTools');
const OK = { adminUserId: 1, stepUpOk: true } as const;
const NOSTEP = { adminUserId: 1, stepUpOk: false } as const;

beforeAll(async () => { db = await bootTempDb(); tools = await import('@/lib/adminAgentTools'); });
beforeEach(() => state.__resetAdminAgentState());

describe('FarePilot tools + gate', () => {
  it('sql_query writes then reads back (with step-up)', async () => {
    const w = await tools.runAdminTool('sql_query', { sql: "INSERT INTO users (email, tier) VALUES ('t@example.com', 'pro')" }, OK);
    expect(w.content).toMatch(/changes: 1/);
    const r = await tools.runAdminTool('sql_query', { sql: "SELECT email, tier FROM users WHERE email='t@example.com'" }, OK);
    expect(r.content).toContain('t@example.com');
  });

  it('read-only tools need no step-up', async () => {
    expect((await tools.runAdminTool('find_client', { query: 't@example' }, NOSTEP)).content).toContain('t@example.com');
    expect((await tools.runAdminTool('app_health', {}, NOSTEP)).content).toContain('active_searches');
  });

  it('sql_query REDACTS secret columns (C2)', async () => {
    db.getDb().prepare("UPDATE users SET totp_secret='TOPSECRETVALUE', stripe_customer_id='cus_123' WHERE id=1").run();
    const r = await tools.runAdminTool('sql_query', { sql: 'SELECT id, totp_secret, stripe_customer_id FROM users WHERE id=1' }, OK);
    expect(r.content).not.toContain('TOPSECRETVALUE');
    expect(r.content).toContain('[redacted]');
  });

  it('client_overview never leaks the TOTP secret', async () => {
    db.getDb().prepare("UPDATE users SET totp_secret='ANOTHERSECRET' WHERE id=1").run();
    const r = await tools.runAdminTool('client_overview', { user_id: 1 }, NOSTEP);
    expect(r.content).not.toContain('ANOTHERSECRET');
  });

  it('run_command executes with step-up', async () => {
    const r = await tools.runAdminTool('run_command', { command: 'echo hello-farepilot' }, OK);
    expect(r.content).toContain('hello-farepilot');
  });

  it('SQL/shell REFUSED without step-up and execute nothing', async () => {
    const before = (db.getDb().prepare("SELECT COUNT(*) n FROM users WHERE email='inject@x.com'").get() as { n: number }).n;
    const s = await tools.runAdminTool('sql_query', { sql: "INSERT INTO users (email) VALUES ('inject@x.com')" }, NOSTEP);
    expect(s.needs_step_up).toBe(true);
    expect((await tools.runAdminTool('run_command', { command: 'echo nope' }, NOSTEP)).needs_step_up).toBe(true);
    const after = (db.getDb().prepare("SELECT COUNT(*) n FROM users WHERE email='inject@x.com'").get() as { n: number }).n;
    expect(after).toBe(before);
  });

  it('rate limit trips after the cap (in memory)', async () => {
    let blocked = false;
    for (let i = 0; i < 40; i++) {
      const r = await tools.runAdminTool('run_command', { command: 'echo x' }, OK);
      if (r.content.includes('Rate limit')) { blocked = true; break; }
    }
    expect(blocked).toBe(true);
  });

  it('audits BEFORE executing (I1): a running row exists, updated after', async () => {
    const id = db.queries.logAdminAgentActionStart({ adminUserId: 1, tool: 'run_command', input: '{}' });
    const row = db.getDb().prepare('SELECT result_preview, ok FROM admin_agent_audit WHERE id=?').get(id) as { result_preview: string; ok: number };
    expect(row.result_preview).toBe('(running)');
    db.queries.updateAdminAgentAction(id, 'done', false);
    const row2 = db.getDb().prepare('SELECT result_preview, ok FROM admin_agent_audit WHERE id=?').get(id) as { result_preview: string; ok: number };
    expect(row2.ok).toBe(0);
  });
});

describe('in-memory step-up state (C3) + brute-force (C1)', () => {
  it('step-up lives in memory, not fares.db', () => {
    state.recordStepUp('sess-1', '111111');
    expect(state.stepUpValid('sess-1')).toBe(true);
    expect(state.stepUpValid('other')).toBe(false);
    // there is no admin_stepup table to tamper with
    const t = db.getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_stepup'").get();
    expect(t).toBeUndefined();
  });

  it('rejects a replayed code within the window (M1)', () => {
    state.recordStepUp('sess-2', '222222');
    expect(state.isCodeReplay('sess-2', '222222')).toBe(true);
    expect(state.isCodeReplay('sess-2', '333333')).toBe(false);
  });

  it('brute-force limiter blocks after 5 attempts (C1)', () => {
    const key = 'sess-bf';
    for (let i = 0; i < 5; i++) { expect(state.verifyAllowed(key)).toBe(true); state.recordVerifyAttempt(key); }
    expect(state.verifyAllowed(key)).toBe(false);
    state.clearVerifyAttempts(key);
    expect(state.verifyAllowed(key)).toBe(true);
  });

  it('a fresh TOTP code verifies; a stale one does not', () => {
    const secret = totp.generateSecret();
    const now = Date.now();
    expect(totp.verify(secret, totp.generate(secret, now), 1, now)).toBe(true);
    expect(totp.verify(secret, totp.generate(secret, now - 120_000), 1, now)).toBe(false);
  });
});

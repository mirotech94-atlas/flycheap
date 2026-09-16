import { describe, it, expect, beforeAll } from 'vitest';
import { bootTempDb } from './helpers/tempDb';
import * as totp from '@/lib/totp';

let db: Awaited<ReturnType<typeof bootTempDb>>;
let tools: typeof import('@/lib/adminAgentTools');
const OK = { adminUserId: 1, stepUpOk: true } as const;
const NOSTEP = { adminUserId: 1, stepUpOk: false } as const;

beforeAll(async () => { db = await bootTempDb(); tools = await import('@/lib/adminAgentTools'); });

describe('admin FarePilot tools + audit', () => {
  it('sql_query writes then reads back (with step-up)', async () => {
    const w = await tools.runAdminTool('sql_query', { sql: "INSERT INTO users (email, tier) VALUES ('t@example.com', 'pro')" }, OK);
    expect(w.is_error).toBeFalsy();
    expect(w.content).toMatch(/changes: 1/);
    const r = await tools.runAdminTool('sql_query', { sql: "SELECT email, tier FROM users WHERE email='t@example.com'" }, OK);
    expect(r.content).toContain('t@example.com');
    expect(r.content).toContain('pro');
  });

  it('find_client + app_health are read-only and need no step-up', async () => {
    const f = await tools.runAdminTool('find_client', { query: 't@example' }, NOSTEP);
    expect(f.content).toContain('t@example.com');
    const h = await tools.runAdminTool('app_health', {}, NOSTEP);
    expect(h.content).toContain('active_searches');
  });

  it('client_overview never leaks the TOTP secret', async () => {
    db.getDb().prepare("UPDATE users SET totp_secret = 'SUPERSECRET', totp_enabled = 1 WHERE id = 1").run();
    const r = await tools.runAdminTool('client_overview', { user_id: 1 }, NOSTEP);
    expect(r.content).not.toContain('SUPERSECRET');
    expect(r.content).toContain('[redacted]');
  });

  it('run_command executes a shell command (with step-up)', async () => {
    const r = await tools.runAdminTool('run_command', { command: 'echo hello-farepilot' }, OK);
    expect(r.is_error).toBeFalsy();
    expect(r.content).toContain('hello-farepilot');
  });

  it('SQL and shell are REFUSED without step-up and do not execute', async () => {
    const before = (db.getDb().prepare("SELECT COUNT(*) n FROM users WHERE email='inject@x.com'").get() as { n: number }).n;
    const s = await tools.runAdminTool('sql_query', { sql: "INSERT INTO users (email) VALUES ('inject@x.com')" }, NOSTEP);
    expect(s.is_error).toBe(true);
    expect(s.needs_step_up).toBe(true);
    expect(s.content).toContain('STEP_UP_REQUIRED');
    const c = await tools.runAdminTool('run_command', { command: 'echo should-not-run' }, NOSTEP);
    expect(c.needs_step_up).toBe(true);
    const after = (db.getDb().prepare("SELECT COUNT(*) n FROM users WHERE email='inject@x.com'").get() as { n: number }).n;
    expect(after).toBe(before); // nothing was inserted
  });

  it('rate limit trips after the cap', async () => {
    let blocked = false;
    for (let i = 0; i < 40; i++) {
      const r = await tools.runAdminTool('run_command', { command: 'echo x' }, OK);
      if (r.content.includes('Rate limit')) { blocked = true; break; }
    }
    expect(blocked).toBe(true);
  });

  it('every tool call — including refusals — is audited', async () => {
    const audit = db.queries.recentAdminAgentAudit(200);
    const used = audit.map(a => a.tool);
    expect(used).toContain('sql_query');
    expect(used).toContain('run_command');
    expect(used).toContain('find_client');
    // a refused (no step-up) call was recorded ok=0
    expect(audit.some(a => a.tool === 'sql_query' && a.ok === 0)).toBe(true);
  });
});

describe('step-up validity + TOTP', () => {
  it('recordStepUp then stepUpValidWithin is true; a fresh token is false', () => {
    db.queries.recordStepUp('sess-abc', 1);
    expect(db.queries.stepUpValidWithin('sess-abc', 600)).toBe(true);
    expect(db.queries.stepUpValidWithin('never-seen', 600)).toBe(false);
  });

  it('a fresh TOTP code verifies; a stale one does not', () => {
    const secret = totp.generateSecret();
    const now = Date.now();
    expect(totp.verify(secret, totp.generate(secret, now), 1, now)).toBe(true);
    // a code from 2 minutes ago is outside the ±1 window
    const stale = totp.generate(secret, now - 120_000);
    expect(totp.verify(secret, stale, 1, now)).toBe(false);
    expect(totp.verify(secret, '000000', 1, now)).toBe(false);
  });
});

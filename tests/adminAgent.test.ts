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

const count = (email: string) =>
  (db.getDb().prepare('SELECT COUNT(*) n FROM users WHERE email = ?').get(email) as { n: number }).n;

/** Records every argv the tool would have run; never spawns a process. */
function fakeRunner() {
  const calls: Array<{ file: string; args: string[] }> = [];
  const runner = async (file: string, args: string[]) => { calls.push({ file, args }); return { ok: true, code: 0, stdout: 'fine', stderr: '' }; };
  return { calls, runner };
}

describe('FarePilot tools + gate', () => {
  it('step-up is ON by default: SQL and commands refuse without a fresh code and run nothing', async () => {
    delete process.env.FAREPILOT_REQUIRE_STEPUP;
    vi.resetModules();
    const gated = await import('@/lib/adminAgentTools');
    const { calls, runner } = fakeRunner();
    const s = await gated.runAdminTool('sql_query', { sql: 'SELECT 1' }, { ...NOSTEP, runner });
    expect(s.needs_step_up).toBe(true);
    const c = await gated.runAdminTool('run_command', { command: 'disk_free' }, { ...NOSTEP, runner });
    expect(c.needs_step_up).toBe(true);
    expect(calls).toHaveLength(0);
    // Read-only shortcuts stay available without a code.
    expect((await gated.runAdminTool('app_health', {}, NOSTEP)).is_error).toBeFalsy();
  });

  it('with no authenticator configured (stepUpAvailable: false), SQL and commands run without a code', async () => {
    delete process.env.FAREPILOT_REQUIRE_STEPUP;
    vi.resetModules();
    const t = await import('@/lib/adminAgentTools');
    const { calls, runner } = fakeRunner();
    const noTotp = { ...NOSTEP, stepUpAvailable: false, runner };
    const s = await t.runAdminTool('sql_query', { sql: 'SELECT 7 AS seven' }, noTotp);
    expect(s.needs_step_up).toBeFalsy();
    expect(s.content).toContain('"seven": 7');
    expect((await t.runAdminTool('run_command', { command: 'uptime' }, noTotp)).needs_step_up).toBeFalsy();
    expect(calls).toHaveLength(1);
    // ...but it is still read-only and allowlisted.
    expect((await t.runAdminTool('sql_query', { sql: 'DELETE FROM users' }, noTotp)).is_error).toBe(true);
    expect((await t.runAdminTool('run_command', { command: 'echo x' }, noTotp)).is_error).toBe(true);
    expect(t.stepUpRequired({ stepUpAvailable: false })).toBe(false);
    expect(t.stepUpRequired({ stepUpAvailable: true })).toBe(true);
    expect(t.adminSystemPrompt(false)).toMatch(/do NOT need an authenticator code/);
    expect(t.adminSystemPrompt(true)).toMatch(/STEP_UP_REQUIRED/);
  });

  it('with an authenticator configured (stepUpAvailable: true), a code is required', async () => {
    const { runner, calls } = fakeRunner();
    const r = await tools.runAdminTool('run_command', { command: 'uptime' }, { ...NOSTEP, stepUpAvailable: true, runner });
    expect(r.needs_step_up).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('FAREPILOT_REQUIRE_STEPUP=0 is the explicit opt-out', async () => {
    process.env.FAREPILOT_REQUIRE_STEPUP = '0';
    vi.resetModules();
    try {
      const open = await import('@/lib/adminAgentTools');
      const r = await open.runAdminTool('sql_query', { sql: 'SELECT 1 AS one' }, NOSTEP);
      expect(r.needs_step_up).toBeFalsy();
      expect(r.content).toContain('"one": 1');
    } finally {
      delete process.env.FAREPILOT_REQUIRE_STEPUP;
      vi.resetModules();
    }
  });

  it('sql_query answers SELECTs, including schema lookups through pragma_table_info', async () => {
    db.getDb().prepare("INSERT OR IGNORE INTO users (email, tier) VALUES ('t@example.com','pro')").run();
    expect((await tools.runAdminTool('find_client', { query: 't@example' }, NOSTEP)).content).toContain('t@example.com');
    const r = await tools.runAdminTool('sql_query', { sql: "SELECT email FROM users WHERE email = 't@example.com'" }, OK);
    expect(r.is_error).toBeFalsy();
    expect(r.content).toContain('t@example.com');
    const cols = await tools.runAdminTool('sql_query', { sql: "SELECT name FROM pragma_table_info('users')" }, OK);
    expect(cols.content).toContain('"email"');
    const cte = await tools.runAdminTool('sql_query', { sql: 'WITH x AS (SELECT 2 AS n) SELECT n FROM x' }, OK);
    expect(cte.content).toContain('"n": 2');
  });

  it('sql_query can never write, whatever shape the statement takes', async () => {
    const tables = () => (db.getDb().prepare("SELECT COUNT(*) n FROM sqlite_master").get() as { n: number }).n;
    const before = { t: tables(), u: count('evil@x.com') };
    const attempts = [
      "INSERT INTO users (email) VALUES ('evil@x.com')",
      "INSERT INTO users (email) VALUES ('evil@x.com') RETURNING id",
      "/* hi */ INSERT INTO users (email) VALUES ('evil@x.com')",
      "WITH x AS (SELECT 1) INSERT INTO users (email) SELECT 'evil@x.com' FROM x",
      "WITH x AS (SELECT 1) DELETE FROM users",
      "UPDATE users SET tier = 'enterprise'",
      'DELETE FROM users',
      'CREATE TABLE pwn (x)',
      'DROP TABLE error_log',
      'ALTER TABLE users ADD COLUMN pwn TEXT',
      "ATTACH DATABASE '/tmp/pwn.db' AS pwn",
      "VACUUM INTO '/tmp/pwn-copy.db'",
      'PRAGMA writable_schema = 1',
      'PRAGMA table_info(users)',
      "SELECT 1; DELETE FROM users",
      'REPLACE INTO users (id, email) VALUES (1, \'evil@x.com\')',
    ];
    for (const sql of attempts) {
      const r = await tools.runAdminTool('sql_query', { sql }, OK);
      expect(r.is_error, sql).toBe(true);
    }
    expect(tables()).toBe(before.t);
    expect(count('evil@x.com')).toBe(before.u);
    expect(db.getDb().prepare("SELECT COUNT(*) n FROM users").get()).toMatchObject({ n: expect.any(Number) });
  });

  it('run_command runs only named, allowlisted commands as fixed argv', async () => {
    const { calls, runner } = fakeRunner();
    const ok = await tools.runAdminTool('run_command', { command: 'disk_free' }, { ...OK, runner });
    expect(ok.is_error).toBeFalsy();
    expect(calls[0]).toEqual({ file: 'df', args: ['-Pk', '/opt/egyptair-tracker'] });

    await tools.runAdminTool('run_command', { command: 'journal', unit: 'egyptair-jobs@digest', lines: 50 }, { ...OK, runner });
    expect(calls[1].args).toEqual(['/usr/bin/journalctl', '-u', 'egyptair-jobs@digest.service', '-n', '50', '--no-pager']);

    for (const bad of [
      { command: 'echo x' }, { command: 'cat .env.local' }, { command: 'disk_free; rm -rf /' },
      { command: 'bash' }, { command: 'journal', unit: 'egyptair-jobs@x;id' }, { command: 'journal', unit: 'ssh' },
      {},
    ]) {
      const r = await tools.runAdminTool('run_command', bad, { ...OK, runner });
      expect(r.is_error, JSON.stringify(bad)).toBe(true);
    }
    expect(calls).toHaveLength(2); // nothing else was executed
  });

  it('the tool schema offers the allowlist, not a free-form shell string', () => {
    const rc = tools.ADMIN_TOOLS.find(t => t.name === 'run_command')!;
    const cmd = (rc.input_schema.properties as Record<string, { enum?: string[] }>).command;
    expect(cmd.enum).toEqual(Object.keys(tools.ADMIN_COMMANDS));
    expect(tools.ADMIN_SYSTEM_PROMPT).not.toMatch(/reads and writes/);
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
    const { runner } = fakeRunner();
    let blocked = false;
    for (let i = 0; i < 40; i++) if ((await tools.runAdminTool('run_command', { command: 'uptime' }, { ...OK, runner })).content.includes('Rate limit')) { blocked = true; break; }
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

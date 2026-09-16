import { describe, it, expect, beforeAll } from 'vitest';
import { bootTempDb } from './helpers/tempDb';

let db: Awaited<ReturnType<typeof bootTempDb>>;
let tools: typeof import('@/lib/adminAgentTools');
beforeAll(async () => { db = await bootTempDb(); tools = await import('@/lib/adminAgentTools'); });

describe('admin FarePilot tools + audit', () => {
  it('sql_query writes then reads back', async () => {
    const w = await tools.runAdminTool('sql_query',
      { sql: "INSERT INTO users (email, tier) VALUES ('t@example.com', 'pro')" }, 1);
    expect(w.is_error).toBeFalsy();
    expect(w.content).toMatch(/changes: 1/);
    const r = await tools.runAdminTool('sql_query',
      { sql: "SELECT email, tier FROM users WHERE email='t@example.com'" }, 1);
    expect(r.content).toContain('t@example.com');
    expect(r.content).toContain('pro');
  });

  it('find_client finds by email', async () => {
    const r = await tools.runAdminTool('find_client', { query: 't@example' }, 1);
    expect(r.content).toContain('t@example.com');
  });

  it('app_health returns operational JSON', async () => {
    const r = await tools.runAdminTool('app_health', {}, 1);
    expect(r.content).toContain('last_poll_attempt');
    expect(r.content).toContain('active_searches');
  });

  it('run_command executes a shell command', async () => {
    const r = await tools.runAdminTool('run_command', { command: 'echo hello-farepilot' }, 1);
    expect(r.is_error).toBeFalsy();
    expect(r.content).toContain('hello-farepilot');
    expect(r.content).toContain('exit: 0');
  });

  it('bad SQL is reported as an error, not thrown', async () => {
    const r = await tools.runAdminTool('sql_query', { sql: 'SELCT nope' }, 1);
    expect(r.is_error).toBe(true);
    expect(r.content).toMatch(/SQL error/);
  });

  it('every tool call is written to the audit trail', async () => {
    const audit = db.queries.recentAdminAgentAudit(50);
    const tools_used = audit.map(a => a.tool);
    expect(tools_used).toContain('sql_query');
    expect(tools_used).toContain('find_client');
    expect(tools_used).toContain('run_command');
    expect(tools_used).toContain('app_health');
    // the bad-SQL call recorded ok=0
    expect(audit.some(a => a.tool === 'sql_query' && a.ok === 0)).toBe(true);
    // the echo run recorded ok=1 and captured a preview
    expect(audit.some(a => a.tool === 'run_command' && a.ok === 1)).toBe(true);
  });
});

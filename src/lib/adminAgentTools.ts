import 'server-only';
import { promisify } from 'node:util';
import { exec as execCb } from 'node:child_process';
import { getDb, queries } from '@/lib/db';

const exec = promisify(execCb);

/**
 * Admin FarePilot — the OWNER-ONLY operator agent.
 *
 * This tool suite is intentionally unrestricted (per the owner's explicit
 * choice): it can run arbitrary SQL against the app database and arbitrary
 * shell commands as the app's OS user (`egyflights`), so it can read, write,
 * and fix anything in the app or for any client. The API route that calls this
 * is gated to the owner identity ONLY, and every single tool call — inputs and
 * a result preview — is written to the admin_agent_audit table.
 *
 * Blast radius note: commands run as `egyflights`, not root. That user owns the
 * app tree + database and holds a narrow sudo whitelist (restart egyptair,
 * start jobs, journalctl, deploy.sh). It cannot run arbitrary root commands.
 */

export const ADMIN_SYSTEM_PROMPT = `You are FarePilot Admin, the operator console for FlyCheap — a private tool used ONLY by the founder to run and fix the business.

You have real, unrestricted power over this production system:
- sql_query runs ANY SQL against the live SQLite database (reads and writes).
- run_command runs ANY shell command as the app user (egyflights) on the production server, in the app directory /opt/egyptair-tracker.
- find_client, client_overview, and app_health are quick read-only shortcuts.

How to work:
- Diagnose before you change. Prefer the read-only shortcuts and SELECT queries to understand the situation first, then make the change.
- When you modify data or system state, say exactly what you did and show the result (rows changed, command output).
- For anything destructive or irreversible (DELETE/DROP/UPDATE across many rows, deleting files, restarting the app), state precisely what you are about to do and why in your reply, do it, then report the outcome. There is no separate confirmation step — you are trusted, so be careful and explicit.
- Never invent data. If a query returns nothing, say so.
- Keep replies short and concrete. Show numbers and command output in fenced blocks.
- Every action you take is written to an audit log automatically.

Useful facts: the database is data/fares.db (better-sqlite3). Key tables: users, searches, fare_snapshots, alerts_sent, api_calls, error_log, chat_sessions, device_tokens, subscriptions/plans via users columns. The poller writes fare_snapshots and records attempts in api_calls. The app runs under systemd unit 'egyptair'; jobs run as egyptair-jobs@<name>.service.`;

export const ADMIN_TOOLS = [
  {
    name: 'find_client',
    description: 'Find client accounts by email, username, or numeric id (partial match on email/username). Returns id, email, username, plan, created_at for up to 20 matches. Use this first when the owner names a client.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'email, username, or user id (partial ok)' } },
      required: ['query'],
    },
  },
  {
    name: 'client_overview',
    description: 'Full snapshot of one client by user id: profile, plan/subscription columns, their active searches, recent alerts, and recent settings. Read-only.',
    input_schema: {
      type: 'object',
      properties: { user_id: { type: 'number', description: 'the client user id' } },
      required: ['user_id'],
    },
  },
  {
    name: 'app_health',
    description: 'Operational health: last poll attempt vs last snapshot write, snapshot/alert counts (1h/24h), active searches, and the most recent error_log rows. Read-only.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'sql_query',
    description: 'Run ANY SQL against the live database. SELECT/PRAGMA return rows; INSERT/UPDATE/DELETE/DDL run and report rows changed. This is unrestricted — use it to read or fix any data. Prefer a SELECT to inspect before you write.',
    input_schema: {
      type: 'object',
      properties: { sql: { type: 'string', description: 'the SQL to execute' } },
      required: ['sql'],
    },
  },
  {
    name: 'run_command',
    description: 'Run ANY shell command on the production server as the app user (egyflights), from /opt/egyptair-tracker. Unrestricted (60s timeout). Use for log inspection, file fixes, restarting the app (sudo systemctl restart egyptair), triggering jobs, etc. Returns stdout, stderr, and exit code.',
    input_schema: {
      type: 'object',
      properties: { command: { type: 'string', description: 'the shell command' } },
      required: ['command'],
    },
  },
] as const;

export type AdminToolResult = { content: string; is_error?: boolean };

function j(v: unknown): string { try { return JSON.stringify(v, null, 2); } catch { return String(v); } }

async function findClient(query: string): Promise<AdminToolResult> {
  const q = `%${query.trim()}%`;
  const idNum = Number(query.trim());
  const rows = getDb().prepare(
    `SELECT id, email, username, tier, created_at FROM users
     WHERE email LIKE ? OR username LIKE ? OR id = ? ORDER BY id DESC LIMIT 20`,
  ).all(q, q, Number.isFinite(idNum) ? idNum : -1);
  return { content: rows.length ? j(rows) : `No client matched "${query}".` };
}

async function clientOverview(userId: number): Promise<AdminToolResult> {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { content: `No user with id ${userId}.`, is_error: true };
  const searches = db.prepare('SELECT * FROM searches WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(userId);
  const alerts = db.prepare(
    `SELECT a.* FROM alerts_sent a JOIN searches s ON s.id = a.search_id WHERE s.user_id = ? ORDER BY a.id DESC LIMIT 20`,
  ).all(userId);
  return { content: j({ user, searches, recent_alerts: alerts }) };
}

async function appHealth(): Promise<AdminToolResult> {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get() as Record<string, unknown>);
  const out = {
    last_poll_attempt: one(`SELECT MAX(called_at) t FROM api_calls`).t,
    last_snapshot_write: one(`SELECT MAX(polled_at) t FROM fare_snapshots`).t,
    snapshots_1h: one(`SELECT COUNT(*) n FROM fare_snapshots WHERE polled_at > datetime('now','-1 hour')`).n,
    snapshots_24h: one(`SELECT COUNT(*) n FROM fare_snapshots WHERE polled_at > datetime('now','-24 hour')`).n,
    alerts_24h: one(`SELECT COUNT(*) n FROM alerts_sent WHERE sent_at > datetime('now','-24 hour')`).n,
    active_searches: one(`SELECT COUNT(*) n FROM searches WHERE active = 1`).n,
    recent_errors: db.prepare(`SELECT occurred_at, level, source, message FROM error_log ORDER BY id DESC LIMIT 10`).all(),
  };
  return { content: j(out) };
}

async function sqlQuery(sql: string): Promise<AdminToolResult> {
  try {
    const stmt = getDb().prepare(sql);
    // better-sqlite3: `reader` is true for statements that return rows (SELECT/PRAGMA/RETURNING).
    if ((stmt as unknown as { reader: boolean }).reader) {
      const rows = stmt.all();
      return { content: `${rows.length} row(s):\n${j(rows).slice(0, 8000)}` };
    }
    const info = stmt.run();
    return { content: `OK — changes: ${info.changes}, lastInsertRowid: ${info.lastInsertRowid}` };
  } catch (e) {
    return { content: `SQL error: ${(e as Error).message}`, is_error: true };
  }
}

async function runCommand(command: string): Promise<AdminToolResult> {
  try {
    const { stdout, stderr } = await exec(command, {
      cwd: process.cwd(), timeout: 60_000, maxBuffer: 4 * 1024 * 1024, shell: '/bin/bash',
    });
    const out = `exit: 0\n--- stdout ---\n${stdout || '(empty)'}\n--- stderr ---\n${stderr || '(empty)'}`;
    return { content: out.slice(0, 8000) };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string; message: string };
    const out = `exit: ${err.code ?? 'error'}\n--- stdout ---\n${err.stdout || '(empty)'}\n--- stderr ---\n${err.stderr || err.message}`;
    return { content: out.slice(0, 8000), is_error: true };
  }
}

/** Execute one admin tool and write the call to the audit trail. */
export async function runAdminTool(
  name: string, input: Record<string, unknown>, adminUserId: number | null,
): Promise<AdminToolResult> {
  let res: AdminToolResult;
  switch (name) {
    case 'find_client':     res = await findClient(String(input.query ?? '')); break;
    case 'client_overview': res = await clientOverview(Number(input.user_id)); break;
    case 'app_health':      res = await appHealth(); break;
    case 'sql_query':       res = await sqlQuery(String(input.sql ?? '')); break;
    case 'run_command':     res = await runCommand(String(input.command ?? '')); break;
    default:                res = { content: `Unknown tool: ${name}`, is_error: true };
  }
  try {
    queries.logAdminAgentAction({
      adminUserId, tool: name, input: j(input),
      resultPreview: res.content.slice(0, 500), ok: !res.is_error,
    });
  } catch { /* audit is best-effort, never blocks the action */ }
  return res;
}

# Slack Ops Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production problems surface in `#admin_alerts` within five minutes with a diagnosis; safe fixes run on their own; everything else is proposed in the thread and runs only after the founder replies.

**Architecture:** A `node-cron` detector inside the existing Next.js process turns failed units, failed job runs, error-log rows, failing health checks and crash loops into rows of a new `ops_incidents` table and one Slack card each. The existing Slack events route gains a branch that hands thread replies under a card to an ops agent (Claude with a small, allow-listed toolset). All shell access goes through one helper backed by a sudoers drop-in that names the exact commands.

**Tech Stack:** Next.js 16 (Node runtime), better-sqlite3, node-cron, `@anthropic-ai/sdk` (already a dependency), Slack Web API over `fetch`, vitest (new dev dependency, Task 1).

**Spec:** `docs/superpowers/specs/2026-09-14-slack-ops-agent-design.md`

## Global Constraints

- The app posts to one Slack channel only: the one in setting `alert_slack_admin_target` (currently `C0B4233G9PE`). Never `alert_slack_target` or `alert_slack_support_target`.
- Ops agent model: `claude-sonnet-5`. Concierge stays on `claude-haiku-4-5-20251001`.
- Safe tools may run unprompted: `restart_app`, `start_job`, `clear_job_lock`, `poll_search`. Gated tools (`set_platform_setting`, `redeploy`) run only after a human reply matching `^(go|yes|do it|approved)\b` (case-insensitive) that follows the agent's proposal of that exact tool and arguments.
- Secrets never pass through Slack. The agent names the variable and gives the server command.
- Unit names passed to the shell must match `^egyptair-(jobs@[a-z0-9-]+|post-video|backup)(\.service)?$`.
- Limits: max 8 tool calls per agent turn; max one `restart_app` per incident per hour; max one `redeploy` per incident; shell output capped at 64 KB.
- Every shell command uses `execFile` with an argument array. No string interpolation into a shell.
- The detector never throws into the app; a probe failure is logged with `queries.logError({ source: 'ops-detector', … })` and skipped.
- **This project is not a git repository.** Steps that would normally commit instead say "checkpoint": run the test suite and stop if red. Files reach production by `scp` to `root@flycheap.18dn.com:/opt/egyptair-tracker/<same path>` followed by `bash /opt/egyptair-tracker/deploy/deploy.sh`, only in Task 9.
- The server's clock is `America/New_York`; SQLite `datetime('now')` is UTC. Compare times with `Date.parse(s.replace(' ', 'T') + 'Z')` for SQLite values and plain `Date.parse` for ISO values.

---

## File structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` (new) | Test runner config: `@/` alias, `server-only` stub, Node environment. |
| `tests/helpers/tempDb.ts` (new) | Boot `src/lib/db.ts` against a temp directory so tests never touch `data/fares.db`. |
| `src/lib/db.ts` (modify) | `ops_incidents` table, `OpsIncidentRow`, incident queries, three read helpers for probes. |
| `src/lib/ops/shell.ts` (new) | The only place that builds and runs privileged commands. Unit-name validation, allow-listed command specs, `execFile` runner with output cap. |
| `src/lib/ops/probes.ts` (new) | Pure functions: raw inputs (command output, rows, health JSON) → `Finding[]`. No I/O. |
| `src/lib/ops/detector.ts` (new) | One `tick(io)`: run probes, upsert incidents, post cards, auto-fix, resolve, persist last tick. All I/O injected through `DetectorIO`. |
| `src/lib/ops/agent.ts` (new) | Tool definitions, `runOpsTool`, approval binding, the Claude loop (`diagnose`, `handleThreadReply`, `autoFix`). Anthropic client injected. |
| `src/lib/ops/card.ts` (new) | Card and thread text formatting. Pure. |
| `src/lib/notifier.ts` (modify) | Export `founderChannelId()` and `postToSlackThread()` so ops code and the events route share one Slack posting path. |
| `src/lib/cron.ts` (modify) | Register the detector every 5 minutes and a one-shot post-boot health check. |
| `src/app/api/slack/events/route.ts` (modify) | Ops branch: human reply in an incident thread in `#admin_alerts` → `handleThreadReply`. |
| `src/app/admin/settings/page.tsx`, `actions.ts` (modify) | `ops_agent_enabled` toggle row. |
| `deploy/sudoers-egyflights-ops` (new), `deploy/setup.sh` (modify) | The privilege boundary and its installation. |

---

### Task 1: Test harness (vitest + temp database)

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/helpers/tempDb.ts`
- Create: `tests/smoke.test.ts`
- Modify: `package.json` (`scripts.test`, devDependency)

**Interfaces:**
- Produces: `bootTempDb(): Promise<typeof import('@/lib/db')>` — changes `process.cwd()` to a fresh temp dir and imports the db module so `getDb()` opens `<tmp>/data/fares.db`.

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest@^3.2.0 --no-audit --no-fund
```

- [ ] **Step 2: Write the config**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // db.ts computes DATA_DIR from process.cwd() at import time; tests chdir
    // first (see tests/helpers/tempDb.ts), so never share a worker's cwd.
    pool: 'forks',
    isolate: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Next's 'server-only' throws outside a React server context; stub it.
      'server-only': path.resolve(__dirname, 'tests/helpers/server-only-stub.ts'),
    },
  },
});
```

`tests/helpers/server-only-stub.ts`:
```ts
export {};
```

- [ ] **Step 3: Write the temp-db helper**

`tests/helpers/tempDb.ts`:
```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Boots src/lib/db.ts against a throwaway directory. Must be awaited before
 * any other '@/lib/*' import in the test file, because db.ts reads
 * process.cwd() when it is first imported.
 */
export async function bootTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flycheap-test-'));
  process.chdir(dir);
  // Fresh module instance per test file (vitest isolates files; this guards
  // against a cached global from a previous import in the same worker).
  delete (globalThis as { __egyptairDb?: unknown }).__egyptairDb;
  const db = await import('@/lib/db');
  db.getDb(); // runs init() → creates all tables
  return db;
}
```

- [ ] **Step 4: Write the smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { bootTempDb } from './helpers/tempDb';

describe('test harness', () => {
  it('boots a temp database with the schema', async () => {
    const db = await bootTempDb();
    const n = (db.getDb().prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
    expect(n).toBe(0);
    expect(process.cwd()).toContain('flycheap-test-');
  });
});
```

- [ ] **Step 5: Add the npm script**

In `package.json` `scripts`, add `"test": "vitest run"`.

- [ ] **Step 6: Run it**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 7: Checkpoint** — suite green.

---

### Task 2: Incident table and queries

**Files:**
- Modify: `src/lib/db.ts` (init() after the `job_runs` block near line 217; `queries` object after `releaseJobLock` near line 1136; types after `UserRow`)
- Test: `tests/ops/incidents.test.ts`

**Interfaces:**
- Produces:
```ts
export type OpsIncidentStatus = 'open' | 'fixing' | 'needs_human' | 'resolved';
export type OpsIncidentRow = {
  id: number; fingerprint: string; source: string; title: string;
  status: OpsIncidentStatus; slack_ts: string | null;
  first_seen: string; last_seen: string; occurrences: number;
  last_action: string | null; resolved_at: string | null;
};
queries.upsertIncident(fingerprint: string, source: string, title: string): { row: OpsIncidentRow; created: boolean }
queries.openIncidents(): OpsIncidentRow[]                       // status != 'resolved'
queries.incidentByThread(slackTs: string): OpsIncidentRow | undefined
queries.incidentById(id: number): OpsIncidentRow | undefined
queries.setIncidentSlackTs(id: number, ts: string): void
queries.setIncidentStatus(id: number, status: OpsIncidentStatus, lastAction?: string | null): void
queries.resolveIncident(id: number): void                      // frees the fingerprint
queries.errorRowsSince(sinceSqlite: string, limit?: number): Array<{ id: number; occurred_at: string; source: string | null; message: string; stack: string | null }>
queries.failedJobRunsSince(sinceSqlite: string): Array<{ job: string; started_at: string; message: string | null }>
queries.latestJobRunOk(job: string): boolean | null
queries.clearStaleJobLock(name: string, minAgeMin: number): number   // rows deleted
```

- [ ] **Step 1: Write the failing test**

`tests/ops/incidents.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { bootTempDb } from '../helpers/tempDb';

let db: Awaited<ReturnType<typeof bootTempDb>>;
beforeAll(async () => { db = await bootTempDb(); });

describe('ops_incidents', () => {
  it('creates once and bumps occurrences on repeat', () => {
    const a = db.queries.upsertIncident('unit:egyptair-jobs@digest.service', 'unit', 'Job failed: digest');
    expect(a.created).toBe(true);
    expect(a.row.status).toBe('open');
    const b = db.queries.upsertIncident('unit:egyptair-jobs@digest.service', 'unit', 'Job failed: digest');
    expect(b.created).toBe(false);
    expect(b.row.id).toBe(a.row.id);
    expect(b.row.occurrences).toBe(2);
  });

  it('finds by thread and by id', () => {
    const { row } = db.queries.upsertIncident('health:last_poll', 'health', 'Health: last_poll');
    db.queries.setIncidentSlackTs(row.id, '1789.001');
    expect(db.queries.incidentByThread('1789.001')?.id).toBe(row.id);
    expect(db.queries.incidentById(row.id)?.slack_ts).toBe('1789.001');
  });

  it('status + last_action', () => {
    const { row } = db.queries.upsertIncident('err:poller:abc', 'err', 'Errors: poller');
    db.queries.setIncidentStatus(row.id, 'needs_human', 'PROPOSAL:{"tool":"redeploy","input":{}}');
    const r = db.queries.incidentById(row.id)!;
    expect(r.status).toBe('needs_human');
    expect(r.last_action).toContain('redeploy');
  });

  it('resolve frees the fingerprint so a recurrence is a new incident', () => {
    const { row } = db.queries.upsertIncident('crashloop', 'crashloop', 'Crash loop');
    db.queries.resolveIncident(row.id);
    expect(db.queries.incidentById(row.id)?.status).toBe('resolved');
    expect(db.queries.openIncidents().find(i => i.id === row.id)).toBeUndefined();
    const again = db.queries.upsertIncident('crashloop', 'crashloop', 'Crash loop');
    expect(again.created).toBe(true);
    expect(again.row.id).not.toBe(row.id);
  });

  it('probe read helpers', () => {
    db.queries.logError({ source: 'poller', message: 'boom' });
    expect(db.queries.errorRowsSince('2000-01-01 00:00:00')).toHaveLength(1);
    const id = db.queries.insertJobRun('digest');
    db.queries.finishJobRun(id, false, 12, 'SMTP down');
    expect(db.queries.failedJobRunsSince('2000-01-01 00:00:00')).toEqual([
      expect.objectContaining({ job: 'digest', message: 'SMTP down' }),
    ]);
    expect(db.queries.latestJobRunOk('digest')).toBe(false);
    expect(db.queries.latestJobRunOk('never-ran')).toBeNull();
    const id2 = db.queries.insertJobRun('digest');
    db.queries.finishJobRun(id2, true, 5, 'ok');
    expect(db.queries.latestJobRunOk('digest')).toBe(true);
  });

  it('clearStaleJobLock only removes old locks', () => {
    expect(db.queries.tryAcquireJobLock('poll', 'h1')).toBe(true);
    expect(db.queries.clearStaleJobLock('poll', 30)).toBe(0);   // fresh → kept
    db.getDb().prepare(`UPDATE job_locks SET started_at = datetime('now', '-45 minutes') WHERE name = 'poll'`).run();
    expect(db.queries.clearStaleJobLock('poll', 30)).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/ops/incidents.test.ts`
Expected: FAIL — `upsertIncident is not a function` (and the others).

- [ ] **Step 3: Add the table in `init()`**

In `src/lib/db.ts`, directly after the `idx_job_runs_job_time` index (line ~226), inside the same `db.exec` string:
```sql
    -- Ops incidents: one row per distinct production problem the ops detector
    -- has seen (src/lib/ops/detector.ts). slack_ts is the #admin_alerts card
    -- whose thread is the conversation with the founder about it.
    CREATE TABLE IF NOT EXISTS ops_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,          -- unit | job | err | health | crashloop
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',   -- open | fixing | needs_human | resolved
      slack_ts TEXT,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      occurrences INTEGER NOT NULL DEFAULT 1,
      last_action TEXT,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ops_incidents_status ON ops_incidents(status);
    CREATE INDEX IF NOT EXISTS idx_ops_incidents_thread ON ops_incidents(slack_ts);
```

- [ ] **Step 4: Add the types**

After the `UserRow` type block:
```ts
export type OpsIncidentStatus = 'open' | 'fixing' | 'needs_human' | 'resolved';
export type OpsIncidentRow = {
  id: number;
  fingerprint: string;
  source: string;
  title: string;
  status: OpsIncidentStatus;
  slack_ts: string | null;
  first_seen: string;
  last_seen: string;
  occurrences: number;
  last_action: string | null;
  resolved_at: string | null;
};
```

- [ ] **Step 5: Add the queries**

In the `queries` object, after `releaseJobLock`:
```ts
  // -------- Ops incidents (src/lib/ops) --------
  upsertIncident: (fingerprint: string, source: string, title: string): { row: OpsIncidentRow; created: boolean } => {
    const db = getDb();
    const existing = db.prepare(`SELECT * FROM ops_incidents WHERE fingerprint = ?`).get(fingerprint) as OpsIncidentRow | undefined;
    if (existing) {
      db.prepare(`UPDATE ops_incidents SET last_seen = datetime('now'), occurrences = occurrences + 1, title = ? WHERE id = ?`)
        .run(title, existing.id);
      return { row: db.prepare(`SELECT * FROM ops_incidents WHERE id = ?`).get(existing.id) as OpsIncidentRow, created: false };
    }
    const r = db.prepare(`INSERT INTO ops_incidents (fingerprint, source, title) VALUES (?, ?, ?)`).run(fingerprint, source, title);
    return { row: db.prepare(`SELECT * FROM ops_incidents WHERE id = ?`).get(Number(r.lastInsertRowid)) as OpsIncidentRow, created: true };
  },
  openIncidents: (): OpsIncidentRow[] =>
    getDb().prepare(`SELECT * FROM ops_incidents WHERE status <> 'resolved' ORDER BY first_seen`).all() as OpsIncidentRow[],
  incidentByThread: (slackTs: string): OpsIncidentRow | undefined =>
    getDb().prepare(`SELECT * FROM ops_incidents WHERE slack_ts = ?`).get(slackTs) as OpsIncidentRow | undefined,
  incidentById: (id: number): OpsIncidentRow | undefined =>
    getDb().prepare(`SELECT * FROM ops_incidents WHERE id = ?`).get(id) as OpsIncidentRow | undefined,
  setIncidentSlackTs: (id: number, ts: string): void => {
    getDb().prepare(`UPDATE ops_incidents SET slack_ts = ? WHERE id = ?`).run(ts, id);
  },
  setIncidentStatus: (id: number, status: OpsIncidentStatus, lastAction?: string | null): void => {
    if (lastAction === undefined) {
      getDb().prepare(`UPDATE ops_incidents SET status = ? WHERE id = ?`).run(status, id);
    } else {
      getDb().prepare(`UPDATE ops_incidents SET status = ?, last_action = ? WHERE id = ?`).run(status, lastAction, id);
    }
  },
  /** Marks resolved and suffixes the fingerprint with #id so a recurrence opens a new incident. */
  resolveIncident: (id: number): void => {
    getDb().prepare(
      `UPDATE ops_incidents SET status = 'resolved', resolved_at = datetime('now'), fingerprint = fingerprint || '#' || id WHERE id = ?`
    ).run(id);
  },

  // -------- Probe inputs for the ops detector --------
  errorRowsSince: (sinceSqlite: string, limit = 200) =>
    getDb().prepare(
      `SELECT id, occurred_at, source, message, stack FROM error_log
        WHERE level = 'error' AND occurred_at > ? ORDER BY occurred_at DESC LIMIT ?`
    ).all(sinceSqlite, limit) as Array<{ id: number; occurred_at: string; source: string | null; message: string; stack: string | null }>,
  failedJobRunsSince: (sinceSqlite: string) =>
    getDb().prepare(
      `SELECT job, started_at, message FROM job_runs WHERE ok = 0 AND started_at > ? ORDER BY started_at DESC`
    ).all(sinceSqlite) as Array<{ job: string; started_at: string; message: string | null }>,
  latestJobRunOk: (job: string): boolean | null => {
    const r = getDb().prepare(
      `SELECT ok FROM job_runs WHERE job = ? AND ok IS NOT NULL ORDER BY started_at DESC LIMIT 1`
    ).get(job) as { ok: number } | undefined;
    return r ? r.ok === 1 : null;
  },
  clearStaleJobLock: (name: string, minAgeMin: number): number =>
    getDb().prepare(
      `DELETE FROM job_locks WHERE name = ? AND started_at < datetime('now', ? || ' minutes')`
    ).run(name, `-${Math.max(1, Math.floor(minAgeMin))}`).changes,
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run tests/ops/incidents.test.ts`
Expected: 6 passed.

- [ ] **Step 7: Checkpoint** — `npm test` green; `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "src/lib/db.ts"` prints nothing.

---

### Task 3: Shell helper (the only privileged path)

**Files:**
- Create: `src/lib/ops/shell.ts`
- Test: `tests/ops/shell.test.ts`

**Interfaces:**
- Produces:
```ts
export type ShellResult = { ok: boolean; code: number | null; stdout: string; stderr: string };
export type Runner = (file: string, args: string[]) => Promise<ShellResult>;
export const UNIT_RE: RegExp;
export function normalizeUnit(input: string): string;            // throws Error('invalid unit') otherwise; always ends in .service
export type CommandSpec = { file: string; args: string[] };
export const commands: {
  restartApp(): CommandSpec;
  resetFailed(unit: string): CommandSpec;
  startUnit(unit: string): CommandSpec;
  listFailed(): CommandSpec;
  journal(unit: string, lines: number): CommandSpec;
  journalSince(minutes: number): CommandSpec;                    // egyptair main service only
  deploy(): CommandSpec;
};
export const defaultRunner: Runner;                              // execFile, 64 KB cap, 120 s timeout
export function run(spec: CommandSpec, runner?: Runner): Promise<ShellResult>;
```

- [ ] **Step 1: Write the failing test**

`tests/ops/shell.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeUnit, commands, run, type Runner } from '@/lib/ops/shell';

describe('normalizeUnit', () => {
  it('accepts the allowed shapes and appends .service', () => {
    expect(normalizeUnit('egyptair-jobs@digest')).toBe('egyptair-jobs@digest.service');
    expect(normalizeUnit('egyptair-jobs@agent-curator.service')).toBe('egyptair-jobs@agent-curator.service');
    expect(normalizeUnit('egyptair-post-video')).toBe('egyptair-post-video.service');
    expect(normalizeUnit('egyptair-backup')).toBe('egyptair-backup.service');
  });
  it('rejects everything else', () => {
    for (const bad of ['caddy', 'egyptair', 'egyptair-jobs@', 'egyptair-jobs@Digest', 'egyptair-jobs@a b', '../x', 'egyptair-jobs@x;rm']) {
      expect(() => normalizeUnit(bad)).toThrow('invalid unit');
    }
  });
});

describe('commands', () => {
  it('builds argument arrays, never a shell string', () => {
    expect(commands.restartApp()).toEqual({ file: 'sudo', args: ['/usr/bin/systemctl', 'restart', 'egyptair'] });
    expect(commands.startUnit('egyptair-jobs@digest')).toEqual({ file: 'sudo', args: ['/usr/bin/systemctl', 'start', 'egyptair-jobs@digest.service'] });
    expect(commands.journal('egyptair-jobs@digest', 500).args).toContain('200'); // capped
    expect(commands.journalSince(15).args).toEqual(['/usr/bin/journalctl', '-u', 'egyptair', '--since', '-15min', '--no-pager', '-o', 'cat']);
    expect(commands.deploy()).toEqual({ file: 'sudo', args: ['/usr/bin/bash', '/opt/egyptair-tracker/deploy/deploy.sh'] });
  });
});

describe('run', () => {
  it('passes the spec to the runner and returns its result', async () => {
    const calls: Array<[string, string[]]> = [];
    const fake: Runner = async (file, args) => { calls.push([file, args]); return { ok: true, code: 0, stdout: 'x', stderr: '' }; };
    const r = await run(commands.listFailed(), fake);
    expect(r.stdout).toBe('x');
    expect(calls).toEqual([['sudo', ['/usr/bin/systemctl', '--failed', '--no-legend', 'egyptair*']]]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/ops/shell.test.ts`
Expected: FAIL — cannot resolve `@/lib/ops/shell`.

- [ ] **Step 3: Implement**

`src/lib/ops/shell.ts`:
```ts
import 'server-only';
import { execFile } from 'node:child_process';

/**
 * The ONLY place privileged commands are built and run. Every spec here has a
 * matching line in deploy/sudoers-egyflights-ops; anything not listed there is
 * refused by sudo regardless of what the model asks for.
 */

export type ShellResult = { ok: boolean; code: number | null; stdout: string; stderr: string };
export type Runner = (file: string, args: string[]) => Promise<ShellResult>;
export type CommandSpec = { file: string; args: string[] };

export const UNIT_RE = /^egyptair-(jobs@[a-z0-9-]+|post-video|backup)(\.service)?$/;

export function normalizeUnit(input: string): string {
  const s = String(input ?? '').trim();
  if (!UNIT_RE.test(s)) throw new Error('invalid unit');
  return s.endsWith('.service') ? s : `${s}.service`;
}

const SYSTEMCTL = '/usr/bin/systemctl';
const JOURNALCTL = '/usr/bin/journalctl';
const MAX_LINES = 200;

export const commands = {
  restartApp: (): CommandSpec => ({ file: 'sudo', args: [SYSTEMCTL, 'restart', 'egyptair'] }),
  resetFailed: (unit: string): CommandSpec => ({ file: 'sudo', args: [SYSTEMCTL, 'reset-failed', normalizeUnit(unit)] }),
  startUnit: (unit: string): CommandSpec => ({ file: 'sudo', args: [SYSTEMCTL, 'start', normalizeUnit(unit)] }),
  listFailed: (): CommandSpec => ({ file: 'sudo', args: [SYSTEMCTL, '--failed', '--no-legend', 'egyptair*'] }),
  journal: (unit: string, lines: number): CommandSpec => {
    const n = Math.min(MAX_LINES, Math.max(10, Math.floor(Number(lines) || 50)));
    // 'egyptair' (main app) or an allowed job unit.
    const u = unit === 'egyptair' ? 'egyptair' : normalizeUnit(unit);
    return { file: 'sudo', args: [JOURNALCTL, '-u', u, '-n', String(n), '--no-pager'] };
  },
  journalSince: (minutes: number): CommandSpec => {
    const m = Math.min(120, Math.max(1, Math.floor(Number(minutes) || 15)));
    return { file: 'sudo', args: [JOURNALCTL, '-u', 'egyptair', '--since', `-${m}min`, '--no-pager', '-o', 'cat'] };
  },
  deploy: (): CommandSpec => ({ file: 'sudo', args: ['/usr/bin/bash', '/opt/egyptair-tracker/deploy/deploy.sh'] }),
};

const OUTPUT_CAP = 64 * 1024;

export const defaultRunner: Runner = (file, args) =>
  new Promise(resolve => {
    execFile(file, args, { timeout: 120_000, maxBuffer: OUTPUT_CAP * 4, env: { PATH: '/usr/bin:/bin' } }, (err, stdout, stderr) => {
      const code = err && typeof (err as NodeJS.ErrnoException & { code?: number | string }).code === 'number'
        ? Number((err as { code?: number }).code) : err ? null : 0;
      resolve({
        ok: !err,
        code,
        stdout: String(stdout ?? '').slice(-OUTPUT_CAP),
        stderr: String(stderr ?? (err ? err.message : '')).slice(-OUTPUT_CAP),
      });
    });
  });

export function run(spec: CommandSpec, runner: Runner = defaultRunner): Promise<ShellResult> {
  return runner(spec.file, spec.args);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/ops/shell.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Checkpoint** — `npm test` green.

---

### Task 4: Probes (pure parsers → findings)

**Files:**
- Create: `src/lib/ops/probes.ts`
- Test: `tests/ops/probes.test.ts`

**Interfaces:**
- Produces:
```ts
export type FindingSource = 'unit' | 'job' | 'err' | 'health' | 'crashloop';
export type Finding = { fingerprint: string; source: FindingSource; title: string; detail: string };
export type HealthJson = { ok: boolean; checks: Record<string, { ok: boolean; detail?: string; ms?: number }> } | null;
export function probeFailedUnits(systemctlOut: string): Finding[];
export function probeJobRuns(rows: Array<{ job: string; started_at: string; message: string | null }>): Finding[];
export function probeErrors(rows: Array<{ source: string | null; message: string; occurred_at: string }>): Finding[];
export function probeHealth(health: HealthJson): Finding[];
export function probeCrashLoop(journalCatOut: string, threshold?: number): Finding[];
export function errorFingerprint(source: string | null, message: string): string;
```

- [ ] **Step 1: Write the failing test**

`tests/ops/probes.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { probeFailedUnits, probeJobRuns, probeErrors, probeHealth, probeCrashLoop, errorFingerprint } from '@/lib/ops/probes';

describe('probeFailedUnits', () => {
  it('parses systemctl --failed --no-legend output', () => {
    const out = [
      '● egyptair-jobs@digest.service loaded failed failed Cheapflight Tracker job runner (digest)',
      '● egyptair-post-video.service  loaded failed failed Cheapflight Tracker — post next video',
      '',
    ].join('\n');
    const f = probeFailedUnits(out);
    expect(f.map(x => x.fingerprint)).toEqual(['unit:egyptair-jobs@digest.service', 'unit:egyptair-post-video.service']);
    expect(f[0].title).toBe('Job failed: egyptair-jobs@digest');
    expect(f[0].source).toBe('unit');
  });
  it('ignores units outside the allow-list even if systemd lists them', () => {
    expect(probeFailedUnits('● caddy.service loaded failed failed Caddy')).toEqual([]);
  });
});

describe('probeJobRuns', () => {
  it('one finding per job, newest message wins', () => {
    const f = probeJobRuns([
      { job: 'agent-curator', started_at: '2026-09-14 23:30:02', message: 'model returned nothing' },
      { job: 'agent-curator', started_at: '2026-09-14 22:30:02', message: 'older' },
      { job: 'digest', started_at: '2026-09-14 13:00:00', message: null },
    ]);
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ fingerprint: 'job:agent-curator', title: 'Job run failed: agent-curator' });
    expect(f[0].detail).toContain('model returned nothing');
  });
});

describe('probeErrors', () => {
  it('groups by source + message prefix', () => {
    const rows = [
      { source: 'poller', message: 'ETIMEDOUT travelpayouts (search 12)', occurred_at: '2026-09-14 10:00:00' },
      { source: 'poller', message: 'ETIMEDOUT travelpayouts (search 13)', occurred_at: '2026-09-14 10:01:00' },
      { source: 'notifier', message: 'Resend 429', occurred_at: '2026-09-14 10:02:00' },
    ];
    const f = probeErrors(rows);
    expect(f).toHaveLength(2);
    expect(f[0].fingerprint).toBe(errorFingerprint('poller', 'ETIMEDOUT travelpayouts (search 12)'));
    expect(f[0].title).toBe('Errors: poller (2 in window)');
  });
  it('fingerprint is stable, short, and ignores numbers', () => {
    const a = errorFingerprint('x', 'a'.repeat(500));
    expect(a).toBe(errorFingerprint('x', 'a'.repeat(500) + 'tail differs'));
    expect(a.length).toBeLessThan(40);
    expect(a.startsWith('err:x:')).toBe(true);
    expect(errorFingerprint('http', 'HTTP 500 from provider')).toBe(errorFingerprint('http', 'HTTP 503 from provider'));
    expect(errorFingerprint('http', 'HTTP 500 from provider')).not.toBe(errorFingerprint('http', 'HTTP timeout from provider'));
    expect(errorFingerprint('a', 'same text')).not.toBe(errorFingerprint('b', 'same text'));
  });
});

describe('probeHealth', () => {
  it('one finding per failing check; none when healthy or unreachable', () => {
    expect(probeHealth({ ok: true, checks: { database: { ok: true } } })).toEqual([]);
    expect(probeHealth(null)).toEqual([{ fingerprint: 'health:unreachable', source: 'health', title: 'Health endpoint unreachable', detail: 'GET /api/health failed' }]);
    const f = probeHealth({ ok: false, checks: { database: { ok: true }, last_poll: { ok: false, detail: '95 min ago' } } });
    expect(f).toEqual([{ fingerprint: 'health:last_poll', source: 'health', title: 'Health check failing: last_poll', detail: '95 min ago' }]);
  });
});

describe('probeCrashLoop', () => {
  it('flags 3+ starts in the window', () => {
    const out = ['Started egyptair.service - EgyptAir Cheap Flights Tracker.', '▲ Next.js 16.2.6', 'Started egyptair.service - EgyptAir Cheap Flights Tracker.', 'Started egyptair.service - EgyptAir Cheap Flights Tracker.'].join('\n');
    expect(probeCrashLoop(out)).toEqual([{ fingerprint: 'crashloop', source: 'crashloop', title: 'App restarting repeatedly (3 starts in 15 min)', detail: expect.stringContaining('3 starts') }]);
    expect(probeCrashLoop('Started egyptair.service - x\nStarted egyptair.service - y')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/ops/probes.test.ts`
Expected: FAIL — cannot resolve `@/lib/ops/probes`.

- [ ] **Step 3: Implement**

`src/lib/ops/probes.ts`:
```ts
import crypto from 'node:crypto';
import { UNIT_RE } from './shell';

/** Pure parsers: raw inputs → findings. No I/O here so every branch is unit-testable. */

export type FindingSource = 'unit' | 'job' | 'err' | 'health' | 'crashloop';
export type Finding = { fingerprint: string; source: FindingSource; title: string; detail: string };
export type HealthJson = { ok: boolean; checks: Record<string, { ok: boolean; detail?: string; ms?: number }> } | null;

export function probeFailedUnits(systemctlOut: string): Finding[] {
  const out: Finding[] = [];
  for (const raw of systemctlOut.split('\n')) {
    const line = raw.replace(/^[●\s]+/, '').trim();
    if (!line) continue;
    const unit = line.split(/\s+/)[0];
    if (!UNIT_RE.test(unit)) continue;
    const name = unit.replace(/\.service$/, '');
    out.push({
      fingerprint: `unit:${unit.endsWith('.service') ? unit : unit + '.service'}`,
      source: 'unit',
      title: `Job failed: ${name}`,
      detail: line,
    });
  }
  return out;
}

export function probeJobRuns(rows: Array<{ job: string; started_at: string; message: string | null }>): Finding[] {
  const byJob = new Map<string, { started_at: string; message: string | null; n: number }>();
  for (const r of rows) {
    const cur = byJob.get(r.job);
    if (!cur) byJob.set(r.job, { started_at: r.started_at, message: r.message, n: 1 });
    else { cur.n += 1; if (r.started_at > cur.started_at) { cur.started_at = r.started_at; cur.message = r.message; } }
  }
  return Array.from(byJob, ([job, v]) => ({
    fingerprint: `job:${job}`,
    source: 'job' as const,
    title: `Job run failed: ${job}`,
    detail: `${v.n} failed run${v.n > 1 ? 's' : ''}; latest ${v.started_at} UTC — ${v.message ?? '(no message)'}`,
  }));
}

/** Digit runs become '#' so the same error groups across ids/counts/status codes. */
export function normalizeErrorMessage(message: string): string {
  return message.replace(/\d+/g, '#').slice(0, 80);
}

export function errorFingerprint(source: string | null, message: string): string {
  const key = `${source ?? '-'}|${normalizeErrorMessage(message)}`;
  return `err:${source ?? '-'}:${crypto.createHash('sha1').update(key).digest('hex').slice(0, 10)}`;
}

export function probeErrors(rows: Array<{ source: string | null; message: string; occurred_at: string }>): Finding[] {
  const groups = new Map<string, { source: string | null; first: string; n: number; latest: string }>();
  for (const r of rows) {
    const fp = errorFingerprint(r.source, r.message);
    const g = groups.get(fp);
    if (!g) groups.set(fp, { source: r.source, first: r.message, n: 1, latest: r.occurred_at });
    else { g.n += 1; if (r.occurred_at > g.latest) g.latest = r.occurred_at; }
  }
  return Array.from(groups, ([fingerprint, g]) => ({
    fingerprint,
    source: 'err' as const,
    title: `Errors: ${g.source ?? 'unknown'} (${g.n} in window)`,
    detail: `${g.first.slice(0, 300)}${g.first.length > 300 ? '…' : ''} — latest ${g.latest} UTC`,
  }));
}

export function probeHealth(health: HealthJson): Finding[] {
  if (!health) {
    return [{ fingerprint: 'health:unreachable', source: 'health', title: 'Health endpoint unreachable', detail: 'GET /api/health failed' }];
  }
  return Object.entries(health.checks)
    .filter(([, c]) => !c.ok)
    .map(([name, c]) => ({
      fingerprint: `health:${name}`,
      source: 'health' as const,
      title: `Health check failing: ${name}`,
      detail: c.detail ?? '(no detail)',
    }));
}

export function probeCrashLoop(journalCatOut: string, threshold = 3): Finding[] {
  const starts = journalCatOut.split('\n').filter(l => /^Started egyptair\.service/.test(l.trim())).length;
  if (starts < threshold) return [];
  return [{
    fingerprint: 'crashloop',
    source: 'crashloop',
    title: `App restarting repeatedly (${starts} starts in 15 min)`,
    detail: `${starts} starts of egyptair.service in the last 15 minutes`,
  }];
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/ops/probes.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Checkpoint** — `npm test` green.

---

### Task 5: Notifier additions (channel id + thread posting)

**Files:**
- Modify: `src/lib/notifier.ts` (next to `postFounderSlack`)
- Test: `tests/ops/notifier-thread.test.ts`

**Interfaces:**
- Produces:
```ts
export function founderChannelId(which: FounderSlackChannel): string;   // '' when unset
export async function postToSlackThread(channel: string, threadTs: string, text: string): Promise<NotifyResult>;
```
- `postFounderSlack('admin', text)` already returns `{ ok, id }` where `id` is the message `ts`; the card poster uses that as the thread key.

- [ ] **Step 1: Write the failing test**

`tests/ops/notifier-thread.test.ts`:
```ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { bootTempDb } from '../helpers/tempDb';

let db: Awaited<ReturnType<typeof bootTempDb>>;
beforeAll(async () => { db = await bootTempDb(); });

describe('notifier founder helpers', () => {
  it('founderChannelId reads the right settings', async () => {
    const n = await import('@/lib/notifier');
    db.queries.setSetting('alert_slack_admin_target', 'C1');
    db.queries.setSetting('alert_slack_target', 'C2');
    expect(n.founderChannelId('admin')).toBe('C1');
    expect(n.founderChannelId('client-mirror')).toBe('C2');
  });

  it('postToSlackThread sends thread_ts and returns the ts', async () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test';
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true, ts: '1.2' }), { status: 200 });
    }));
    const n = await import('@/lib/notifier');
    const r = await n.postToSlackThread('C1', '1.0', 'hello');
    expect(r).toMatchObject({ ok: true, id: '1.2' });
    expect(calls[0].url).toBe('https://slack.com/api/chat.postMessage');
    expect(calls[0].body).toMatchObject({ channel: 'C1', thread_ts: '1.0', text: 'hello', unfurl_links: false });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/ops/notifier-thread.test.ts`
Expected: FAIL — `founderChannelId is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/notifier.ts`, replace the body of `postFounderSlack` so it uses a shared getter, and add the thread poster:
```ts
export function founderChannelId(which: FounderSlackChannel): string {
  const key = which === 'admin' ? 'alert_slack_admin_target' : 'alert_slack_target';
  return queries.getSetting(key) ?? '';
}

export async function postFounderSlack(
  which: FounderSlackChannel,
  text: string,
  blocks?: unknown[],
): Promise<NotifyResult> {
  const channel = founderChannelId(which);
  if (!channel) return { channel: 'slack', ok: false, skipped: `${which === 'admin' ? 'alert_slack_admin_target' : 'alert_slack_target'} not set` };
  return postToSlackChannel(channel, text, blocks);
}

/** Reply inside an existing thread (chat.postMessage with thread_ts). */
export async function postToSlackThread(channel: string, threadTs: string, text: string): Promise<NotifyResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { channel: 'slack', ok: false, skipped: 'SLACK_BOT_TOKEN not set' };
  if (!channel || !threadTs) return { channel: 'slack', ok: false, skipped: 'no channel/thread' };
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, thread_ts: threadTs, text, unfurl_links: false }),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) return { channel: 'slack', ok: false, error: j.error || `HTTP ${res.status}` };
    return { channel: 'slack', ok: true, id: String(j.ts ?? '') };
  } catch (e) {
    return { channel: 'slack', ok: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/ops/notifier-thread.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Checkpoint** — `npm test` green; tsc clean for `notifier.ts`.

---

### Task 6: Card formatting

**Files:**
- Create: `src/lib/ops/card.ts`
- Test: `tests/ops/card.test.ts`

**Interfaces:**
- Produces:
```ts
export type CardFooter =
  | { kind: 'fixing'; text: string }
  | { kind: 'needs_you'; text: string }
  | { kind: 'none' };
export function formatCard(args: { title: string; firstSeen: string; occurrences: number; evidence: string; diagnosis: string | null; footer: CardFooter }): string;
export function formatResolved(title: string): string;
export function formatBackUp(): string;
export function truncate(s: string, max: number): string;
```

- [ ] **Step 1: Write the failing test**

`tests/ops/card.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatCard, formatResolved, truncate } from '@/lib/ops/card';

describe('formatCard', () => {
  it('renders every section in order', () => {
    const s = formatCard({
      title: 'Job failed: egyptair-jobs@digest',
      firstSeen: '2026-09-14 23:30:02',
      occurrences: 3,
      evidence: 'line1\nline2',
      diagnosis: 'SMTP creds expired.',
      footer: { kind: 'fixing', text: 'restarting egyptair-jobs@digest' },
    });
    expect(s.split('\n')[0]).toBe('🔴 *Job failed: egyptair-jobs@digest*');
    expect(s).toContain('*Since:* 2026-09-14 23:30 UTC · *Seen:* 3×');
    expect(s).toContain('*What I see:*\n```line1\nline2```');
    expect(s).toContain('*Diagnosis:* SMTP creds expired.');
    expect(s).toContain('*Fixing:* restarting egyptair-jobs@digest');
  });
  it('needs-you footer and missing diagnosis', () => {
    const s = formatCard({ title: 't', firstSeen: '2026-09-14 23:30:02', occurrences: 1, evidence: '', diagnosis: null, footer: { kind: 'needs_you', text: 'ANTHROPIC_API_KEY is unset' } });
    expect(s).toContain('*Diagnosis:* unavailable');
    expect(s).toContain('*Needs you:* ANTHROPIC_API_KEY is unset');
    expect(s).not.toContain('What I see');
  });
  it('truncates long evidence', () => {
    expect(truncate('a'.repeat(50), 10)).toBe('aaaaaaaaa…');
    expect(truncate('short', 10)).toBe('short');
  });
  it('resolved line', () => {
    expect(formatResolved('Job failed: x')).toBe('✅ Resolved — Job failed: x has been clear for 60 min.');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/ops/card.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

`src/lib/ops/card.ts`:
```ts
/** Slack text for incident cards and thread follow-ups. Pure; no I/O. */

export type CardFooter =
  | { kind: 'fixing'; text: string }
  | { kind: 'needs_you'; text: string }
  | { kind: 'none' };

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function formatCard(args: {
  title: string; firstSeen: string; occurrences: number;
  evidence: string; diagnosis: string | null; footer: CardFooter;
}): string {
  const since = args.firstSeen.replace(/:\d\d$/, '').replace('T', ' ');
  const lines = [
    `🔴 *${args.title}*`,
    `*Since:* ${since} UTC · *Seen:* ${args.occurrences}×`,
  ];
  const ev = args.evidence.trim();
  if (ev) lines.push(`*What I see:*\n\`\`\`${truncate(ev, 1500)}\`\`\``);
  lines.push(`*Diagnosis:* ${args.diagnosis?.trim() || 'unavailable'}`);
  if (args.footer.kind === 'fixing') lines.push(`*Fixing:* ${args.footer.text}`);
  if (args.footer.kind === 'needs_you') lines.push(`*Needs you:* ${args.footer.text}`);
  return lines.join('\n');
}

export function formatResolved(title: string): string {
  return `✅ Resolved — ${title} has been clear for 60 min.`;
}

export function formatBackUp(): string {
  return '✅ Back up, health OK.';
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/ops/card.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Checkpoint** — `npm test` green.

---

### Task 7: Ops agent (tools, approval binding, Claude loop)

**Files:**
- Create: `src/lib/ops/agent.ts`
- Test: `tests/ops/agent.test.ts`

**Interfaces:**
- Consumes: Task 2 queries, Task 3 `commands`/`run`/`Runner`, `pollSearch` from `@/lib/poller`, `EDITABLE`-style validation copied from `src/app/admin/settings/actions.ts` (the server action file is `'use server'` and cannot be imported here; the two validators needed are duplicated as `SETTING_VALIDATORS` below).
- Produces:
```ts
export type OpsMode = 'read' | 'safe' | 'full';
export type Proposal = { tool: 'set_platform_setting' | 'redeploy'; input: Record<string, unknown>; reason: string };
export type ThreadMsg = { role: 'user' | 'assistant'; content: string };
export type MessagesClient = { messages: { create(p: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> } };
export type AgentDeps = { runner: Runner; client: MessagesClient | null; fetchHealth: () => Promise<HealthJson>; now?: () => Date };
export const OPS_TOOLS: Anthropic.Tool[];
export const SAFE_TOOLS: ReadonlySet<string>;
export const GATED_TOOLS: ReadonlySet<string>;
export function parseProposal(lastAction: string | null): Proposal | null;      // 'PROPOSAL:' + JSON
export function approvalGranted(latestHumanText: string): boolean;               // regex from Global Constraints
export function runOpsTool(name: string, input: Record<string, unknown>, ctx: { incident: OpsIncidentRow; mode: OpsMode; approvedProposal: Proposal | null; deps: AgentDeps }): Promise<ToolResult & { proposal?: Proposal; restarted?: boolean }>;
export function diagnose(incident: OpsIncidentRow, evidence: string, deps: AgentDeps): Promise<{ text: string; safeAction: { tool: string; input: Record<string, unknown> } | null }>;
export function autoFix(incident: OpsIncidentRow, action: { tool: string; input: Record<string, unknown> }, deps: AgentDeps): Promise<{ text: string; restarted: boolean }>;
export function handleThreadReply(incident: OpsIncidentRow, thread: ThreadMsg[], latest: string, deps: AgentDeps): Promise<{ text: string; restarted: boolean }>;
```
- `ToolResult` is `{ content: string; is_error?: boolean }` (same shape as `src/lib/chatTools.ts`).

- [ ] **Step 1: Write the failing test**

`tests/ops/agent.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { bootTempDb } from '../helpers/tempDb';

let db: Awaited<ReturnType<typeof bootTempDb>>;
let agent: typeof import('@/lib/ops/agent');
beforeAll(async () => { db = await bootTempDb(); agent = await import('@/lib/ops/agent'); });

const calls: Array<[string, string[]]> = [];
const runner = async (file: string, args: string[]) => { calls.push([file, args]); return { ok: true, code: 0, stdout: `ran ${args.join(' ')}`, stderr: '' }; };
const deps = () => ({ runner, client: null, fetchHealth: async () => ({ ok: true, checks: {} }) });

/** Scripted fake Anthropic client: returns the given messages in order. */
function scripted(turns: Array<Anthropic.Message['content']>): import('@/lib/ops/agent').MessagesClient {
  let i = 0;
  return { messages: { create: async () => {
    const content = turns[Math.min(i++, turns.length - 1)];
    const stop_reason = content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn';
    return { id: 'm', type: 'message', role: 'assistant', model: 'x', content, stop_reason, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } as unknown as Anthropic.Message;
  } } };
}

describe('approval + proposal parsing', () => {
  it('matches the approval words only at the start', () => {
    for (const s of ['go', 'Go ahead', 'yes please', 'do it', 'APPROVED']) expect(agent.approvalGranted(s)).toBe(true);
    for (const s of ['no', 'not yet', 'why?', 'goat', 'yesterday it broke']) expect(agent.approvalGranted(s)).toBe(false);
  });
  it('parses PROPOSAL: payloads and rejects junk', () => {
    expect(agent.parseProposal('PROPOSAL:{"tool":"redeploy","input":{},"reason":"r"}')).toEqual({ tool: 'redeploy', input: {}, reason: 'r' });
    expect(agent.parseProposal('restarted')).toBeNull();
    expect(agent.parseProposal('PROPOSAL:{"tool":"restart_app"}')).toBeNull(); // not gated → not a proposal
  });
});

describe('runOpsTool', () => {
  it('read mode refuses safe and gated tools', async () => {
    const { row } = db.queries.upsertIncident('unit:egyptair-jobs@digest.service', 'unit', 't');
    const r = await agent.runOpsTool('restart_app', {}, { incident: row, mode: 'read', approvedProposal: null, deps: deps() });
    expect(r.is_error).toBe(true);
    expect(r.content).toContain('not allowed in read mode');
  });
  it('start_job validates the unit and runs reset-failed then start', async () => {
    const { row } = db.queries.upsertIncident('unit:x', 'unit', 't');
    calls.length = 0;
    const r = await agent.runOpsTool('start_job', { unit: 'egyptair-jobs@digest' }, { incident: row, mode: 'safe', approvedProposal: null, deps: deps() });
    expect(r.is_error).toBeFalsy();
    expect(calls.map(c => c[1].join(' '))).toEqual([
      '/usr/bin/systemctl reset-failed egyptair-jobs@digest.service',
      '/usr/bin/systemctl start egyptair-jobs@digest.service',
    ]);
    const bad = await agent.runOpsTool('start_job', { unit: 'caddy' }, { incident: row, mode: 'safe', approvedProposal: null, deps: deps() });
    expect(bad.is_error).toBe(true);
  });
  it('restart_app is rate-limited to once per incident per hour', async () => {
    const { row } = db.queries.upsertIncident('health:last_poll', 'health', 't');
    const a = await agent.runOpsTool('restart_app', {}, { incident: row, mode: 'safe', approvedProposal: null, deps: deps() });
    expect(a.restarted).toBe(true);
    const b = await agent.runOpsTool('restart_app', {}, { incident: db.queries.incidentById(row.id)!, mode: 'safe', approvedProposal: null, deps: deps() });
    expect(b.is_error).toBe(true);
    expect(b.content).toContain('already restarted');
  });
  it('gated tool without approval records a proposal instead of running', async () => {
    const { row } = db.queries.upsertIncident('err:a:b', 'err', 't');
    calls.length = 0;
    const r = await agent.runOpsTool('redeploy', {}, { incident: row, mode: 'full', approvedProposal: null, deps: deps() });
    expect(r.is_error).toBe(true);
    expect(r.content).toContain('NEEDS_APPROVAL');
    expect(r.proposal).toEqual({ tool: 'redeploy', input: {}, reason: expect.any(String) });
    expect(calls).toEqual([]);
    expect(db.queries.incidentById(row.id)?.status).toBe('needs_human');
    expect(agent.parseProposal(db.queries.incidentById(row.id)!.last_action)?.tool).toBe('redeploy');
  });
  it('gated tool runs only when it equals the approved proposal', async () => {
    const { row } = db.queries.upsertIncident('err:c:d', 'err', 't');
    const approved = { tool: 'set_platform_setting' as const, input: { key: 'poll_interval_minutes', value: '15' }, reason: 'r' };
    calls.length = 0;
    const other = await agent.runOpsTool('redeploy', {}, { incident: row, mode: 'full', approvedProposal: approved, deps: deps() });
    expect(other.is_error).toBe(true);
    const ok = await agent.runOpsTool('set_platform_setting', { key: 'poll_interval_minutes', value: '15' }, { incident: row, mode: 'full', approvedProposal: approved, deps: deps() });
    expect(ok.is_error).toBeFalsy();
    expect(db.queries.getSetting('poll_interval_minutes')).toBe('15');
    const invalid = await agent.runOpsTool('set_platform_setting', { key: 'poll_interval_minutes', value: 'abc' },
      { incident: row, mode: 'full', approvedProposal: { ...approved, input: { key: 'poll_interval_minutes', value: 'abc' } }, deps: deps() });
    expect(invalid.is_error).toBe(true);
  });
});

describe('loops', () => {
  it('diagnose extracts a safe action from propose_action', async () => {
    const { row } = db.queries.upsertIncident('unit:egyptair-jobs@compact.service', 'unit', 'Job failed: compact');
    const client = scripted([
      [{ type: 'tool_use', id: 't1', name: 'propose_action', input: { tool: 'start_job', input: { unit: 'egyptair-jobs@compact' }, reason: 'transient' } }],
      [{ type: 'text', text: 'Compact failed once; restarting it.', citations: null }],
    ] as unknown as Array<Anthropic.Message['content']>);
    const d = await agent.diagnose(row, 'evidence', { ...deps(), client });
    expect(d.text).toContain('Compact failed once');
    expect(d.safeAction).toEqual({ tool: 'start_job', input: { unit: 'egyptair-jobs@compact' } });
  });
  it('diagnose with no client returns unavailable', async () => {
    const { row } = db.queries.upsertIncident('unit:y', 'unit', 't');
    const d = await agent.diagnose(row, 'e', deps());
    expect(d).toEqual({ text: null, safeAction: null });
  });
  it('handleThreadReply with approval executes the pending proposal', async () => {
    const { row } = db.queries.upsertIncident('err:e:f', 'err', 't');
    db.queries.setIncidentStatus(row.id, 'needs_human', 'PROPOSAL:{"tool":"redeploy","input":{},"reason":"fix"}');
    calls.length = 0;
    const client = scripted([
      [{ type: 'tool_use', id: 't1', name: 'redeploy', input: {} }],
      [{ type: 'text', text: 'Redeployed.', citations: null }],
    ] as unknown as Array<Anthropic.Message['content']>);
    const r = await agent.handleThreadReply(db.queries.incidentById(row.id)!, [{ role: 'assistant', content: 'I propose redeploy' }], 'go', { ...deps(), client });
    expect(r.text).toBe('Redeployed.');
    expect(calls.map(c => c[1].join(' '))).toEqual(['/usr/bin/bash /opt/egyptair-tracker/deploy/deploy.sh']);
    expect(db.queries.incidentById(row.id)?.status).toBe('fixing');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/ops/agent.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

`src/lib/ops/agent.ts`:
```ts
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { queries, type OpsIncidentRow } from '@/lib/db';
import { commands, run, type Runner } from './shell';
import type { HealthJson } from './probes';

/**
 * The ops agent: Claude with a small, allow-listed toolset. Three entry points
 * (diagnose / autoFix / handleThreadReply) share one loop. The model never
 * touches the shell directly — every tool call goes through runOpsTool, which
 * enforces mode, unit validation, rate limits and the approval binding.
 */

export type OpsMode = 'read' | 'safe' | 'full';
export type ToolResult = { content: string; is_error?: boolean };
export type Proposal = { tool: 'set_platform_setting' | 'redeploy'; input: Record<string, unknown>; reason: string };
export type ThreadMsg = { role: 'user' | 'assistant'; content: string };
export type MessagesClient = { messages: { create(p: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> } };
export type AgentDeps = { runner: Runner; client: MessagesClient | null; fetchHealth: () => Promise<HealthJson>; now?: () => Date };

export const OPS_MODEL = 'claude-sonnet-5';
const MAX_TOOL_CALLS = 8;
const RESTART_COOLDOWN_MS = 60 * 60 * 1000;

export const READ_TOOLS: ReadonlySet<string> = new Set(['read_logs', 'read_error_log', 'health_check', 'job_history', 'list_failed_units', 'propose_action']);
export const SAFE_TOOLS: ReadonlySet<string> = new Set(['restart_app', 'start_job', 'clear_job_lock', 'poll_search']);
export const GATED_TOOLS: ReadonlySet<string> = new Set(['set_platform_setting', 'redeploy']);

const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: 'object' as const, properties, required });

export const OPS_TOOLS: Anthropic.Tool[] = [
  { name: 'read_logs', description: 'Last N journal lines for a unit. unit is "egyptair" (the app) or an egyptair-jobs@<name> / egyptair-post-video / egyptair-backup unit.', input_schema: obj({ unit: { type: 'string' }, lines: { type: 'integer', minimum: 10, maximum: 200 } }, ['unit']) },
  { name: 'read_error_log', description: 'Newest rows from the app error_log table.', input_schema: obj({ limit: { type: 'integer', minimum: 1, maximum: 50 } }) },
  { name: 'health_check', description: 'GET /api/health on the app.', input_schema: obj({}) },
  { name: 'job_history', description: 'Recent job_runs rows for one job name (e.g. digest, agent-curator).', input_schema: obj({ job: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, ['job']) },
  { name: 'list_failed_units', description: 'systemctl --failed for egyptair* units.', input_schema: obj({}) },
  { name: 'propose_action', description: 'In diagnosis mode only: name ONE action you recommend. Safe tools (restart_app, start_job, clear_job_lock, poll_search) will run automatically. Gated tools (set_platform_setting, redeploy) will be shown to the founder for approval.', input_schema: obj({ tool: { type: 'string' }, input: { type: 'object' }, reason: { type: 'string' } }, ['tool', 'input', 'reason']) },
  { name: 'restart_app', description: 'SAFE. systemctl restart egyptair. Ends your turn; say so before calling.', input_schema: obj({}) },
  { name: 'start_job', description: 'SAFE. reset-failed + start an egyptair-jobs@<name>, egyptair-post-video or egyptair-backup unit.', input_schema: obj({ unit: { type: 'string' } }, ['unit']) },
  { name: 'clear_job_lock', description: 'SAFE. Delete a job_locks row older than 30 minutes (stuck lock).', input_schema: obj({ name: { type: 'string' } }, ['name']) },
  { name: 'poll_search', description: 'SAFE. Re-poll one tracked route by search id.', input_schema: obj({ id: { type: 'integer' } }, ['id']) },
  { name: 'set_platform_setting', description: 'GATED (needs founder approval). Change one platform setting. Allowed keys: poll_interval_minutes, alert_channels, enabled_providers, price_drop_pct, alert_threshold_per_adult_usd.', input_schema: obj({ key: { type: 'string' }, value: { type: 'string' }, reason: { type: 'string' } }, ['key', 'value', 'reason']) },
  { name: 'redeploy', description: 'GATED (needs founder approval). Rebuild and restart the app with deploy.sh (auto-rolls back on failed health check).', input_schema: obj({ reason: { type: 'string' } }, ['reason']) },
];

const SETTING_VALIDATORS: Record<string, (v: string) => string | null> = {
  poll_interval_minutes: v => /^\d+$/.test(v) && +v >= 1 && +v <= 1440 ? null : 'whole minutes 1–1440',
  alert_channels: v => v.split(',').map(s => s.trim()).every(s => ['email', 'sms', 'whatsapp', 'telegram', 'slack', 'push'].includes(s)) && v.trim() ? null : 'unknown channel',
  enabled_providers: v => v.split(',').map(s => s.trim()).every(s => ['travelpayouts', 'amadeus', 'serpapi', 'duffel', 'kiwi', 'searchapi'].includes(s)) && v.trim() ? null : 'unknown provider',
  price_drop_pct: v => /^\d+(\.\d+)?$/.test(v) && +v > 0 && +v <= 100 ? null : 'percent 1–100',
  alert_threshold_per_adult_usd: v => /^\d+(\.\d+)?$/.test(v) && +v > 0 && +v <= 100000 ? null : 'positive USD ≤ 100000',
};

export function approvalGranted(latestHumanText: string): boolean {
  return /^(go|yes|do it|approved)\b/i.test(latestHumanText.trim());
}

export function parseProposal(lastAction: string | null): Proposal | null {
  if (!lastAction || !lastAction.startsWith('PROPOSAL:')) return null;
  try {
    const p = JSON.parse(lastAction.slice('PROPOSAL:'.length));
    if (!GATED_TOOLS.has(p?.tool) || typeof p.input !== 'object' || p.input === null) return null;
    return { tool: p.tool, input: p.input, reason: String(p.reason ?? '') };
  } catch { return null; }
}

const sameInput = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

function fmt(r: { ok: boolean; stdout: string; stderr: string; code: number | null }): ToolResult {
  const text = [r.stdout.trim(), r.stderr.trim()].filter(Boolean).join('\n--- stderr ---\n') || '(no output)';
  return { content: r.ok ? text : `exit ${r.code ?? '?'}\n${text}`, is_error: !r.ok };
}

export async function runOpsTool(
  name: string,
  input: Record<string, unknown>,
  ctx: { incident: OpsIncidentRow; mode: OpsMode; approvedProposal: Proposal | null; deps: AgentDeps },
): Promise<ToolResult & { proposal?: Proposal; restarted?: boolean }> {
  const { incident, mode, deps } = ctx;
  const now = deps.now?.() ?? new Date();
  const isRead = READ_TOOLS.has(name), isSafe = SAFE_TOOLS.has(name), isGated = GATED_TOOLS.has(name);
  if (!isRead && !isSafe && !isGated) return { content: `unknown tool ${name}`, is_error: true };
  if (mode === 'read' && !isRead) return { content: `${name} is not allowed in read mode`, is_error: true };
  if (mode === 'safe' && isGated) return { content: `${name} needs founder approval; not available in auto-fix`, is_error: true };

  try {
    switch (name) {
      case 'read_logs': return fmt(await run(commands.journal(String(input.unit ?? 'egyptair'), Number(input.lines ?? 50)), deps.runner));
      case 'list_failed_units': return fmt(await run(commands.listFailed(), deps.runner));
      case 'health_check': { const h = await deps.fetchHealth(); return { content: h ? JSON.stringify(h, null, 1) : 'health endpoint unreachable', is_error: !h }; }
      case 'read_error_log': {
        const rows = queries.errorRowsSince('1970-01-01 00:00:00', Math.min(50, Number(input.limit ?? 20)));
        return { content: rows.length ? rows.map(r => `${r.occurred_at} [${r.source ?? '-'}] ${r.message}`).join('\n') : 'no error rows' };
      }
      case 'job_history': {
        const rows = queries.getDb().prepare(`SELECT started_at, ok, duration_ms, message FROM job_runs WHERE job = ? ORDER BY started_at DESC LIMIT ?`)
          .all(String(input.job ?? ''), Math.min(20, Number(input.limit ?? 10))) as Array<{ started_at: string; ok: number | null; duration_ms: number | null; message: string | null }>;
        return { content: rows.length ? rows.map(r => `${r.started_at} ${r.ok === 1 ? 'ok' : r.ok === 0 ? 'FAIL' : 'running'} ${r.duration_ms ?? '?'}ms ${r.message ?? ''}`).join('\n') : 'no runs' };
      }
      case 'propose_action': {
        const tool = String(input.tool ?? '');
        if (!SAFE_TOOLS.has(tool) && !GATED_TOOLS.has(tool)) return { content: `cannot propose ${tool}`, is_error: true };
        return { content: `recorded proposal: ${tool}` };
      }
      case 'restart_app': {
        const last = incident.last_action?.startsWith('RESTARTED:') ? Date.parse(incident.last_action.slice(10)) : NaN;
        if (Number.isFinite(last) && now.getTime() - last < RESTART_COOLDOWN_MS) {
          return { content: 'already restarted the app for this incident within the last hour; not restarting again', is_error: true };
        }
        queries.setIncidentStatus(incident.id, 'fixing', `RESTARTED:${now.toISOString()}`);
        const r = fmt(await run(commands.restartApp(), deps.runner));
        return { ...r, restarted: true };
      }
      case 'start_job': {
        const unit = String(input.unit ?? '');
        const a = await run(commands.resetFailed(unit), deps.runner);
        const b = await run(commands.startUnit(unit), deps.runner);
        queries.setIncidentStatus(incident.id, 'fixing', `STARTED:${unit}`);
        return fmt({ ok: a.ok && b.ok, code: b.code, stdout: `${a.stdout}\n${b.stdout}`, stderr: `${a.stderr}\n${b.stderr}` });
      }
      case 'clear_job_lock': {
        const n = queries.clearStaleJobLock(String(input.name ?? ''), 30);
        return { content: n ? `cleared ${n} stale lock(s)` : 'no stale lock with that name (locks younger than 30 min are kept)' };
      }
      case 'poll_search': {
        const { pollSearch } = await import('@/lib/poller');
        const r = await pollSearch(Number(input.id));
        return r ? { content: JSON.stringify(r) } : { content: 'search not found', is_error: true };
      }
      case 'set_platform_setting':
      case 'redeploy': {
        const proposal: Proposal = { tool: name, input: { ...input }, reason: String(input.reason ?? '') };
        delete (proposal.input as { reason?: unknown }).reason;
        const approved = ctx.approvedProposal && ctx.approvedProposal.tool === name && sameInput(ctx.approvedProposal.input, proposal.input);
        if (!approved) {
          queries.setIncidentStatus(incident.id, 'needs_human', `PROPOSAL:${JSON.stringify(proposal)}`);
          return { content: `NEEDS_APPROVAL: I have recorded this proposal. Tell the founder exactly what you want to run and why, and ask them to reply "go".`, is_error: true, proposal };
        }
        if (name === 'set_platform_setting') {
          const key = String(proposal.input.key ?? ''), value = String(proposal.input.value ?? '');
          const v = SETTING_VALIDATORS[key];
          if (!v) return { content: `setting ${key} is not editable here`, is_error: true };
          const err = v(value);
          if (err) return { content: `invalid value for ${key}: ${err}`, is_error: true };
          const before = queries.getSetting(key) ?? null;
          queries.setSetting(key, value);
          queries.insertAudit({ user_id: null, email: 'ops-agent', action: 'settings.update', entity: `setting:${key}`, detail: { before, after: value, via: 'slack-ops-agent', incident: incident.id }, ip: null });
          queries.setIncidentStatus(incident.id, 'fixing', `SET:${key}=${value}`);
          return { content: `set ${key}: ${before ?? '(unset)'} → ${value}` };
        }
        if (incident.last_action?.startsWith('DEPLOYED:')) return { content: 'already redeployed once for this incident', is_error: true };
        queries.setIncidentStatus(incident.id, 'fixing', `DEPLOYED:${now.toISOString()}`);
        return { ...fmt(await run(commands.deploy(), deps.runner)), restarted: true };
      }
    }
  } catch (e) {
    return { content: `tool ${name} threw: ${(e as Error).message}`, is_error: true };
  }
  return { content: `unhandled tool ${name}`, is_error: true };
}

const SYSTEM = `You are the FlyCheap ops agent. You watch one production server (a small VPS running a Next.js app as systemd unit "egyptair", with scheduled job units "egyptair-jobs@<name>") and report to the founder in Slack.
Rules:
- Safe tools (restart_app, start_job, clear_job_lock, poll_search) you may use on your own when they plausibly fix the problem.
- Gated tools (set_platform_setting, redeploy) only run after the founder replies "go" to a proposal you stated plainly: the exact tool, its arguments, and why.
- You never change code, billing, or user data. If the fix needs those, say so and stop.
- Secrets never go through Slack. If a key or credential is missing, name the environment variable and give the founder this exact command to run on the server, then ask them to reply "done":
  sed -i 's/^VAR=.*/VAR=<value>/' /opt/egyptair-tracker/.env.local   (or append if absent)
- Be concrete and short. Slack formatting: *bold*, code in backticks, no headers.
- End every turn with either a one-line status or a "Needs you:" line naming exactly what you need.`;

async function loop(opts: {
  incident: OpsIncidentRow; mode: OpsMode; messages: Anthropic.MessageParam[]; deps: AgentDeps;
  approvedProposal: Proposal | null; onTool?: (name: string, input: Record<string, unknown>, result: ToolResult & { proposal?: Proposal }) => void;
}): Promise<{ text: string | null; restarted: boolean; toolCalls: number }> {
  const { deps } = opts;
  if (!deps.client) return { text: null, restarted: false, toolCalls: 0 };
  const messages = [...opts.messages];
  let restarted = false, toolCalls = 0;
  const modeNote = opts.mode === 'read' ? 'MODE: diagnosis only. Use read tools, then call propose_action once if an action would help, then summarise in 2–4 sentences.'
    : opts.mode === 'safe' ? 'MODE: auto-fix. Run the one safe action you were given, check the result, summarise in one or two lines.'
    : 'MODE: conversation with the founder in the incident thread.';
  for (let i = 0; i < MAX_TOOL_CALLS + 1; i++) {
    const res = await deps.client.messages.create({ model: OPS_MODEL, max_tokens: 1200, system: `${SYSTEM}\n\n${modeNote}`, tools: OPS_TOOLS, messages });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim();
    if (res.stop_reason !== 'tool_use') return { text: text || null, restarted, toolCalls };
    messages.push({ role: 'assistant', content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')) {
      toolCalls += 1;
      const input = (t.input ?? {}) as Record<string, unknown>;
      const r = toolCalls > MAX_TOOL_CALLS
        ? { content: 'tool budget exhausted for this turn; summarise now', is_error: true }
        : await runOpsTool(t.name, input, { incident: queries.incidentById(opts.incident.id) ?? opts.incident, mode: opts.mode, approvedProposal: opts.approvedProposal, deps });
      if ((r as { restarted?: boolean }).restarted) restarted = true;
      opts.onTool?.(t.name, input, r);
      results.push({ type: 'tool_result', tool_use_id: t.id, content: r.content, is_error: r.is_error ?? false });
    }
    messages.push({ role: 'user', content: results });
    if (restarted) {
      // The process is about to die; return whatever text we have.
      return { text: text || 'Restarting now — I will confirm health after boot.', restarted, toolCalls };
    }
  }
  return { text: 'Stopping: too many tool calls this turn.', restarted, toolCalls };
}

export async function diagnose(incident: OpsIncidentRow, evidence: string, deps: AgentDeps):
  Promise<{ text: string | null; safeAction: { tool: string; input: Record<string, unknown> } | null }> {
  let safeAction: { tool: string; input: Record<string, unknown> } | null = null;
  const r = await loop({
    incident, mode: 'read', deps, approvedProposal: null,
    messages: [{ role: 'user', content: `Incident: ${incident.title}\nSource: ${incident.source}\nSeen ${incident.occurrences}× since ${incident.first_seen} UTC.\n\nEvidence:\n${evidence || '(none gathered)'}` }],
    onTool: (name, input) => {
      if (name === 'propose_action' && SAFE_TOOLS.has(String(input.tool))) {
        safeAction = { tool: String(input.tool), input: (input.input ?? {}) as Record<string, unknown> };
      }
    },
  });
  return { text: r.text, safeAction };
}

export async function autoFix(incident: OpsIncidentRow, action: { tool: string; input: Record<string, unknown> }, deps: AgentDeps):
  Promise<{ text: string; restarted: boolean }> {
  if (!SAFE_TOOLS.has(action.tool)) return { text: `refusing to auto-run ${action.tool}`, restarted: false };
  const r = await loop({
    incident, mode: 'safe', deps, approvedProposal: null,
    messages: [{ role: 'user', content: `Run this safe action now and report: ${action.tool} ${JSON.stringify(action.input)}` }],
  });
  return { text: r.text ?? 'done', restarted: r.restarted };
}

export async function handleThreadReply(incident: OpsIncidentRow, thread: ThreadMsg[], latest: string, deps: AgentDeps):
  Promise<{ text: string; restarted: boolean }> {
  const pending = parseProposal(incident.last_action);
  const approvedProposal = pending && approvalGranted(latest) ? pending : null;
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Incident #${incident.id}: ${incident.title} (status ${incident.status}, seen ${incident.occurrences}× since ${incident.first_seen} UTC).` },
    ...thread.map(m => ({ role: m.role, content: m.content })),
  ];
  if (messages[messages.length - 1]?.role !== 'user' || messages[messages.length - 1]?.content !== latest) {
    messages.push({ role: 'user', content: latest });
  }
  if (approvedProposal) {
    messages.push({ role: 'user', content: `[system] The founder approved your pending proposal exactly as recorded: ${JSON.stringify(approvedProposal)}. Call that tool with those arguments now, then report.` });
  }
  const r = await loop({ incident, mode: 'full', deps, approvedProposal, messages });
  return { text: r.text ?? 'AI assist is unavailable right now; here is nothing new. Reply again later.', restarted: r.restarted };
}
```

Note for the implementer: `queries.getDb` does not exist; `job_history` must import `getDb` from `@/lib/db` (`import { queries, getDb, type OpsIncidentRow } from '@/lib/db'`) and call `getDb().prepare(...)`. Apply that when writing the file.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/ops/agent.test.ts`
Expected: 9 passed.

- [ ] **Step 5: Checkpoint** — `npm test` green; `tsc --noEmit` shows nothing for `src/lib/ops/`.

---

### Task 8: Detector tick

**Files:**
- Create: `src/lib/ops/detector.ts`
- Test: `tests/ops/detector.test.ts`

**Interfaces:**
- Consumes: Tasks 2–7.
- Produces:
```ts
export type DetectorIO = {
  runner: Runner;
  fetchHealth: () => Promise<HealthJson>;
  postCard: (text: string) => Promise<string | null>;                 // returns ts
  postThread: (ts: string, text: string) => Promise<void>;
  client: MessagesClient | null;
  now?: () => Date;
};
export function tick(io: DetectorIO): Promise<{ created: number; resolved: number; posted: number; skipped: string | null }>;
export function productionIO(): DetectorIO;   // real runner, loopback health fetch, notifier posting, Anthropic client
export function postBootCheck(io: DetectorIO): Promise<void>;   // after restart: health OK → "✅ Back up" in threads of incidents in 'fixing'
```

- [ ] **Step 1: Write the failing test**

`tests/ops/detector.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { bootTempDb } from '../helpers/tempDb';

let db: Awaited<ReturnType<typeof bootTempDb>>;
let det: typeof import('@/lib/ops/detector');
beforeAll(async () => { db = await bootTempDb(); det = await import('@/lib/ops/detector'); });

function io(over: Partial<import('@/lib/ops/detector').DetectorIO> & { failed?: string; journal?: string } = {}) {
  const cards: string[] = []; const threads: Array<[string, string]> = []; let n = 0;
  const base: import('@/lib/ops/detector').DetectorIO = {
    runner: async (_f, args) => ({ ok: true, code: 0, stderr: '', stdout: args.includes('--failed') ? (over.failed ?? '') : args.includes('--since') ? (over.journal ?? '') : 'ok' }),
    fetchHealth: async () => ({ ok: true, checks: { database: { ok: true } } }),
    postCard: async () => `ts.${++n}`,
    postThread: async (ts, text) => { threads.push([ts, text]); },
    client: null,
    ...over,
  };
  const wrapped = { ...base, postCard: async (t: string) => { cards.push(t); return base.postCard(t); } };
  return { io: wrapped, cards, threads };
}

describe('tick', () => {
  it('creates one incident + card per failed unit, and only once', async () => {
    const h = io({ failed: '● egyptair-jobs@digest.service loaded failed failed x' });
    const a = await det.tick(h.io);
    expect(a).toMatchObject({ created: 1, posted: 1 });
    expect(h.cards[0]).toContain('🔴 *Job failed: egyptair-jobs@digest*');
    expect(db.queries.incidentByThread('ts.1')?.fingerprint).toBe('unit:egyptair-jobs@digest.service');
    const b = await det.tick(h.io);
    expect(b).toMatchObject({ created: 0, posted: 0 });
    expect(db.queries.incidentByThread('ts.1')?.occurrences).toBe(2);
  });

  it('resolves unit incidents when the unit is no longer failed', async () => {
    const h = io({ failed: '' });
    const r = await det.tick(h.io);
    expect(r.resolved).toBe(1);
    expect(h.threads).toEqual([['ts.1', expect.stringContaining('✅ Resolved')]]);
    expect(db.queries.openIncidents()).toEqual([]);
  });

  it('error rows become an incident; it resolves only after 60 quiet minutes', async () => {
    db.queries.logError({ source: 'poller', message: 'ETIMEDOUT' });
    const h = io();
    await det.tick(h.io);
    const inc = db.queries.openIncidents().find(i => i.source === 'err')!;
    expect(inc.title).toBe('Errors: poller (1 in window)');
    await det.tick(h.io);
    expect(db.queries.openIncidents()).toHaveLength(1);              // quiet, but < 60 min
    db.getDb().prepare(`UPDATE ops_incidents SET last_seen = datetime('now', '-61 minutes') WHERE id = ?`).run(inc.id);
    const r = await det.tick(h.io);
    expect(r.resolved).toBe(1);
  });

  it('retries a card whose post failed earlier', async () => {
    let fail = true;
    const h = io({ failed: '● egyptair-post-video.service loaded failed failed x', postCard: async () => (fail ? null : 'ts.9') });
    await det.tick(h.io);
    expect(db.queries.openIncidents()[0].slack_ts).toBeNull();
    fail = false;
    const r = await det.tick(h.io);
    expect(r.posted).toBe(1);
    expect(db.queries.openIncidents()[0].slack_ts).toBe('ts.9');
  });

  it('skips when another tick holds the lock', async () => {
    db.queries.tryAcquireJobLock('ops-detector', 'other');
    const r = await det.tick(io().io);
    expect(r.skipped).toBe('locked');
    db.queries.releaseJobLock('ops-detector', 'other');
  });

  it('never throws when a probe throws', async () => {
    const h = io({ runner: async () => { throw new Error('sudo: not allowed'); } });
    await expect(det.tick(h.io)).resolves.toBeTruthy();
    const errs = db.queries.errorRowsSince('1970-01-01 00:00:00').filter(r => r.source === 'ops-detector');
    expect(errs.length).toBeGreaterThan(0);
  });
});

describe('postBootCheck', () => {
  it('posts back-up into fixing threads and resolves cleared ones', async () => {
    const { row } = db.queries.upsertIncident('health:last_poll', 'health', 'Health check failing: last_poll');
    db.queries.setIncidentSlackTs(row.id, 'ts.h');
    db.queries.setIncidentStatus(row.id, 'fixing', 'RESTARTED:2026-09-14T00:00:00Z');
    const h = io();
    await det.postBootCheck(h.io);
    expect(h.threads).toContainEqual(['ts.h', '✅ Back up, health OK.']);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/ops/detector.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

`src/lib/ops/detector.ts`:
```ts
import 'server-only';
import { queries, type OpsIncidentRow } from '@/lib/db';
import { commands, run, defaultRunner, type Runner } from './shell';
import { probeFailedUnits, probeJobRuns, probeErrors, probeHealth, probeCrashLoop, type Finding, type HealthJson } from './probes';
import { formatCard, formatResolved, formatBackUp, type CardFooter } from './card';
import { diagnose, autoFix, type AgentDeps, type MessagesClient } from './agent';

export type DetectorIO = {
  runner: Runner;
  fetchHealth: () => Promise<HealthJson>;
  postCard: (text: string) => Promise<string | null>;
  postThread: (ts: string, text: string) => Promise<void>;
  client: MessagesClient | null;
  now?: () => Date;
};

const LOCK = 'ops-detector';
const LAST_TICK_KEY = 'ops_detector_last_tick';
const ERR_QUIET_MS = 60 * 60 * 1000;

const sqliteNow = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
const parseSqlite = (s: string) => Date.parse(s.replace(' ', 'T') + 'Z');

async function gather(io: DetectorIO, since: string): Promise<Finding[]> {
  const out: Finding[] = [];
  const probes: Array<[string, () => Promise<Finding[]>]> = [
    ['units', async () => probeFailedUnits((await run(commands.listFailed(), io.runner)).stdout)],
    ['jobs', async () => probeJobRuns(queries.failedJobRunsSince(since))],
    ['errors', async () => probeErrors(queries.errorRowsSince(since))],
    ['health', async () => probeHealth(await io.fetchHealth())],
    ['crashloop', async () => probeCrashLoop((await run(commands.journalSince(15), io.runner)).stdout)],
  ];
  for (const [name, p] of probes) {
    try { out.push(...(await p())); }
    catch (e) { queries.logError({ source: 'ops-detector', message: `probe ${name} failed: ${(e as Error).message}` }); }
  }
  return out;
}

async function evidenceFor(f: Finding, io: DetectorIO): Promise<string> {
  try {
    if (f.source === 'unit') {
      const unit = f.fingerprint.slice('unit:'.length);
      return (await run(commands.journal(unit, 30), io.runner)).stdout || f.detail;
    }
    if (f.source === 'crashloop' || f.source === 'health') {
      return (await run(commands.journal('egyptair', 40), io.runner)).stdout || f.detail;
    }
  } catch { /* fall through */ }
  return f.detail;
}

function agentDeps(io: DetectorIO): AgentDeps {
  return { runner: io.runner, client: io.client, fetchHealth: io.fetchHealth, now: io.now };
}

async function openCard(inc: OpsIncidentRow, f: Finding, io: DetectorIO): Promise<{ posted: boolean; restarted: boolean }> {
  const evidence = await evidenceFor(f, io);
  const d = await diagnose(inc, evidence, agentDeps(io));
  let footer: CardFooter = { kind: 'none' };
  if (d.safeAction) footer = { kind: 'fixing', text: `${d.safeAction.tool} ${JSON.stringify(d.safeAction.input)}` };
  const pending = queries.incidentById(inc.id)?.last_action;
  if (pending?.startsWith('PROPOSAL:')) footer = { kind: 'needs_you', text: 'see the proposal below and reply *go* to approve' };
  const ts = await io.postCard(formatCard({ title: inc.title, firstSeen: inc.first_seen, occurrences: inc.occurrences, evidence, diagnosis: d.text, footer }));
  if (!ts) return { posted: false, restarted: false };
  queries.setIncidentSlackTs(inc.id, ts);
  if (!d.safeAction) return { posted: true, restarted: false };
  const fix = await autoFix(queries.incidentById(inc.id) ?? inc, d.safeAction, agentDeps(io));
  await io.postThread(ts, fix.text);
  return { posted: true, restarted: fix.restarted };
}

export async function tick(io: DetectorIO): Promise<{ created: number; resolved: number; posted: number; skipped: string | null }> {
  const now = io.now?.() ?? new Date();
  const holder = `tick-${now.getTime()}`;
  if (!queries.tryAcquireJobLock(LOCK, holder, 600)) return { created: 0, resolved: 0, posted: 0, skipped: 'locked' };
  let created = 0, resolved = 0, posted = 0;
  try {
    const since = queries.getSetting(LAST_TICK_KEY) ?? sqliteNow(new Date(now.getTime() - 24 * 3600 * 1000));
    const findings = await gather(io, since);
    const seen = new Set<string>();
    for (const f of findings) {
      seen.add(f.fingerprint);
      const { row, created: isNew } = queries.upsertIncident(f.fingerprint, f.source, f.title);
      if (isNew) {
        created += 1;
        try {
          const r = await openCard(row, f, io);
          if (r.posted) posted += 1;
          if (r.restarted) return { created, resolved, posted, skipped: 'restarting' };
        } catch (e) {
          queries.logError({ source: 'ops-detector', message: `card for ${f.fingerprint} failed: ${(e as Error).message}` });
        }
      }
    }
    // Retry cards that never posted (Slack was down), and resolve cleared incidents.
    for (const inc of queries.openIncidents()) {
      if (!inc.slack_ts) {
        const f = findings.find(x => x.fingerprint === inc.fingerprint) ?? { fingerprint: inc.fingerprint, source: inc.source as Finding['source'], title: inc.title, detail: '' };
        try { const r = await openCard(inc, f, io); if (r.posted) posted += 1; if (r.restarted) return { created, resolved, posted, skipped: 'restarting' }; }
        catch (e) { queries.logError({ source: 'ops-detector', message: `retry card ${inc.fingerprint}: ${(e as Error).message}` }); }
        continue;
      }
      const stillPresent = seen.has(inc.fingerprint);
      let cleared = false;
      if (inc.source === 'err') cleared = !stillPresent && now.getTime() - parseSqlite(inc.last_seen) > ERR_QUIET_MS;
      else if (inc.source === 'job') cleared = queries.latestJobRunOk(inc.fingerprint.slice('job:'.length)) === true;
      else cleared = !stillPresent;
      if (cleared) {
        try { await io.postThread(inc.slack_ts, formatResolved(inc.title)); } catch { /* best-effort */ }
        queries.resolveIncident(inc.id);
        resolved += 1;
      }
    }
    queries.setSetting(LAST_TICK_KEY, sqliteNow(now));
  } catch (e) {
    queries.logError({ source: 'ops-detector', message: `tick failed: ${(e as Error).message}`, stack: (e as Error).stack });
  } finally {
    queries.releaseJobLock(LOCK, holder);
  }
  return { created, resolved, posted, skipped: null };
}

export async function postBootCheck(io: DetectorIO): Promise<void> {
  try {
    const h = await io.fetchHealth();
    const fixing = queries.openIncidents().filter(i => i.status === 'fixing' && i.slack_ts);
    if (!fixing.length) return;
    if (h?.ok) {
      for (const inc of fixing) await io.postThread(inc.slack_ts!, formatBackUp());
    } else {
      const bad = h ? Object.entries(h.checks).filter(([, c]) => !c.ok).map(([k, c]) => `${k}: ${c.detail ?? 'failing'}`).join('; ') : 'health endpoint unreachable';
      for (const inc of fixing) {
        await io.postThread(inc.slack_ts!, `⚠️ Back up but not healthy — ${bad}\n*Needs you:* tell me how you want to proceed, or reply *go* if you want a redeploy proposal.`);
        queries.setIncidentStatus(inc.id, 'needs_human');
      }
    }
  } catch (e) {
    queries.logError({ source: 'ops-detector', message: `postBootCheck: ${(e as Error).message}` });
  }
}

export function productionIO(): DetectorIO {
  return {
    runner: defaultRunner,
    fetchHealth: async () => {
      try {
        const r = await fetch('http://127.0.0.1:3000/api/health', { headers: { Host: 'flycheap.18dn.com' }, signal: AbortSignal.timeout(8000) });
        return r.ok || r.status === 503 ? (await r.json()) as HealthJson : null;
      } catch { return null; }
    },
    postCard: async text => {
      const { postFounderSlack } = await import('@/lib/notifier');
      const r = await postFounderSlack('admin', text);
      return r.ok && r.id ? r.id : null;
    },
    postThread: async (ts, text) => {
      const { postToSlackThread, founderChannelId } = await import('@/lib/notifier');
      await postToSlackThread(founderChannelId('admin'), ts, text);
    },
    client: process.env.ANTHROPIC_API_KEY
      ? (new (require('@anthropic-ai/sdk').default)({ apiKey: process.env.ANTHROPIC_API_KEY }) as MessagesClient)
      : null,
  };
}
```

Note for the implementer: replace the `require` in `productionIO` with a top-level `import Anthropic from '@anthropic-ai/sdk'` and `new Anthropic({ apiKey })`; the SDK is already a dependency and ESM-importable.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/ops/detector.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Checkpoint** — `npm test` green; tsc clean for `src/lib/ops/`.

---

### Task 9: Wiring (cron, Slack events branch, settings toggle) and the privilege boundary

**Files:**
- Modify: `src/lib/cron.ts` (end of `startCron()`)
- Modify: `src/app/api/slack/events/route.ts` (event handler, ~line 190–215)
- Modify: `src/app/admin/settings/page.tsx` (ROWS), `src/app/admin/settings/actions.ts` (EDITABLE)
- Create: `deploy/sudoers-egyflights-ops`
- Modify: `deploy/setup.sh` (after the service install, ~line 57)
- Test: `tests/ops/events-branch.test.ts` for the pure routing decision

**Interfaces:**
- Consumes: `tick`, `productionIO`, `postBootCheck` (Task 8); `handleThreadReply` (Task 7); `incidentByThread` (Task 2); `founderChannelId`, `postToSlackThread` (Task 5).
- Produces: `export function routeSlackMessage(ev: { channel: string; thread_ts?: string; ts: string; bot_id?: string; subtype?: string; text?: string }, ids: { admin: string; support: string }, hasIncident: (ts: string) => boolean): 'ops' | 'support' | 'ignore'` in `src/lib/ops/route.ts` (new, tiny, pure — keeps the routing decision testable without Slack).

- [ ] **Step 1: Write the failing routing test**

`tests/ops/events-branch.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { routeSlackMessage } from '@/lib/ops/route';

const ids = { admin: 'CADMIN', support: 'CSUP' };
const has = (ts: string) => ts === '100.1';

describe('routeSlackMessage', () => {
  it('human reply in an incident thread in #admin_alerts → ops', () => {
    expect(routeSlackMessage({ channel: 'CADMIN', thread_ts: '100.1', ts: '100.2', text: 'go' }, ids, has)).toBe('ops');
  });
  it('root messages and non-incident threads in #admin_alerts are ignored', () => {
    expect(routeSlackMessage({ channel: 'CADMIN', ts: '101.0', text: 'hi' }, ids, has)).toBe('ignore');
    expect(routeSlackMessage({ channel: 'CADMIN', thread_ts: '999.9', ts: '999.10', text: 'hi' }, ids, has)).toBe('ignore');
  });
  it('bot and subtype messages are ignored everywhere', () => {
    expect(routeSlackMessage({ channel: 'CADMIN', thread_ts: '100.1', ts: '100.3', text: 'x', bot_id: 'B1' }, ids, has)).toBe('ignore');
    expect(routeSlackMessage({ channel: 'CSUP', ts: '1.0', text: 'x', subtype: 'message_changed' }, ids, has)).toBe('ignore');
  });
  it('support channel humans → support (unchanged behaviour)', () => {
    expect(routeSlackMessage({ channel: 'CSUP', ts: '1.0', text: 'help' }, ids, has)).toBe('support');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/ops/events-branch.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement the router**

`src/lib/ops/route.ts`:
```ts
/** Pure routing decision for Slack message events. Kept out of the route file so it is testable. */
export function routeSlackMessage(
  ev: { channel: string; thread_ts?: string; ts: string; bot_id?: string; subtype?: string; text?: string },
  ids: { admin: string; support: string },
  hasIncident: (threadTs: string) => boolean,
): 'ops' | 'support' | 'ignore' {
  const human = !ev.bot_id && !ev.subtype && typeof ev.text === 'string' && ev.text.trim().length > 0;
  if (!human) return 'ignore';
  if (ids.admin && ev.channel === ids.admin) {
    return ev.thread_ts && ev.thread_ts !== ev.ts && hasIncident(ev.thread_ts) ? 'ops' : 'ignore';
  }
  if (ids.support && ev.channel === ids.support) return 'support';
  return 'ignore';
}
```

- [ ] **Step 4: Run the routing test**

Run: `npx vitest run tests/ops/events-branch.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Wire the Slack events route**

In `src/app/api/slack/events/route.ts`, add imports:
```ts
import { routeSlackMessage } from '@/lib/ops/route';
import { founderChannelId, postToSlackThread } from '@/lib/notifier';
```
Replace the block that starts `const supportChannel = queries.getSetting('alert_slack_support_target') ?? '';` and the `isHumanMessage` / `if (isHumanMessage && rememberEvent(eventId))` section with:
```ts
    const ids = { admin: founderChannelId('admin'), support: queries.getSetting('alert_slack_support_target') ?? '' };
    const decision = routeSlackMessage(ev, ids, ts => Boolean(queries.incidentByThread(ts)));

    if (decision !== 'ignore' && rememberEvent(eventId)) {
      const isThreadReply = Boolean(ev.thread_ts && ev.thread_ts !== ev.ts);
      const threadTs: string = ev.thread_ts || ev.ts;
      if (decision === 'support') {
        void answerInThread(ev.channel, threadTs, ev.text, { isThreadReply });
      } else {
        // Ops agent: founder replying under an incident card in #admin_alerts.
        void (async () => {
          try {
            if ((queries.getSetting('ops_agent_enabled') ?? 'true') === 'false') {
              await postToSlackThread(ev.channel, threadTs, 'Ops agent is switched off in Admin → Settings.');
              return;
            }
            const { handleThreadReply } = await import('@/lib/ops/agent');
            const { productionIO } = await import('@/lib/ops/detector');
            const incident = queries.incidentByThread(threadTs)!;
            const history = await fetchThreadHistory(ev.channel, threadTs);
            const io = productionIO();
            const r = await handleThreadReply(incident, history, String(ev.text), { runner: io.runner, client: io.client, fetchHealth: io.fetchHealth });
            await postToSlackThread(ev.channel, threadTs, r.text);
          } catch (e) {
            console.error('[slack-ops] reply failed:', (e as Error).message);
            await postToSlackThread(ev.channel, threadTs, `⚠️ I hit an error handling that: ${(e as Error).message}`);
          }
        })();
      }
    }
```
Leave `answerInThread`, `fetchThreadHistory`, `postToSlackChannelThread` as they are.

- [ ] **Step 6: Register the detector in cron**

In `src/lib/cron.ts`, add to the top-level `let` declarations: `let opsTask: cron.ScheduledTask | null = null;` and the import `import { tick as opsTick, productionIO as opsIO, postBootCheck as opsPostBootCheck } from './ops/detector';`. At the end of `startCron()`:
```ts
  // Ops detector — every 5 minutes. Off switch: setting ops_agent_enabled=false.
  if (opsTask) opsTask.stop();
  opsTask = cron.schedule('*/5 * * * *', async () => {
    if ((queries.getSetting('ops_agent_enabled') ?? 'true') === 'false') return;
    try {
      const r = await opsTick(opsIO());
      if (r.created || r.resolved || r.posted || r.skipped) console.log(`[ops] tick`, r);
    } catch (e) {
      console.error('[ops] tick threw', e);
    }
  });
  console.log('[cron] ops detector scheduled — every 5 min');

  // After a (re)start: confirm health in the threads of incidents we were fixing.
  setTimeout(() => {
    if ((queries.getSetting('ops_agent_enabled') ?? 'true') === 'false') return;
    opsPostBootCheck(opsIO()).catch(e => console.error('[ops] post-boot check threw', e));
  }, 60_000).unref();
```

- [ ] **Step 7: Settings toggle**

`src/app/admin/settings/page.tsx`, append to `ROWS`:
```ts
  { key: 'ops_agent_enabled', label: 'Slack ops agent', fallback: 'true',
    hint: 'Watches for failed jobs, errors and health problems every 5 min, posts cards to #admin_alerts, runs safe fixes on its own, and answers replies in the card thread. Set to false to switch it off.',
    options: ['true', 'false'] },
```
`src/app/admin/settings/actions.ts`, append to `EDITABLE`:
```ts
  ops_agent_enabled: {
    label: 'Slack ops agent',
    validate: v => v === 'true' || v === 'false' ? null : 'Enter true or false.',
  },
```

- [ ] **Step 8: The sudoers file**

`deploy/sudoers-egyflights-ops`:
```
# Installed to /etc/sudoers.d/egyflights-ops by deploy/setup.sh (mode 0440).
# The FlyCheap ops agent (src/lib/ops/shell.ts) may run exactly these.
Defaults:egyflights !requiretty
egyflights ALL=(root) NOPASSWD: /usr/bin/systemctl restart egyptair
egyflights ALL=(root) NOPASSWD: /usr/bin/systemctl reset-failed egyptair-jobs@*.service, /usr/bin/systemctl start egyptair-jobs@*.service
egyflights ALL=(root) NOPASSWD: /usr/bin/systemctl reset-failed egyptair-post-video.service, /usr/bin/systemctl start egyptair-post-video.service
egyflights ALL=(root) NOPASSWD: /usr/bin/systemctl reset-failed egyptair-backup.service, /usr/bin/systemctl start egyptair-backup.service
egyflights ALL=(root) NOPASSWD: /usr/bin/systemctl --failed --no-legend egyptair\*
egyflights ALL=(root) NOPASSWD: /usr/bin/journalctl -u egyptair -n [0-9]* --no-pager, /usr/bin/journalctl -u egyptair-jobs@*.service -n [0-9]* --no-pager, /usr/bin/journalctl -u egyptair-post-video.service -n [0-9]* --no-pager, /usr/bin/journalctl -u egyptair-backup.service -n [0-9]* --no-pager
egyflights ALL=(root) NOPASSWD: /usr/bin/journalctl -u egyptair --since -[0-9]*min --no-pager -o cat
egyflights ALL=(root) NOPASSWD: /usr/bin/bash /opt/egyptair-tracker/deploy/deploy.sh
```
In `deploy/setup.sh`, after the `systemctl enable --now egyptair` line:
```bash
# Ops agent privilege boundary — exact commands the app user may run via sudo.
install -o root -g root -m 0440 deploy/sudoers-egyflights-ops /etc/sudoers.d/egyflights-ops
visudo -cf /etc/sudoers.d/egyflights-ops
```

- [ ] **Step 9: Full local check**

Run: `npm test` → all green. Run: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/lib/(ops|cron|notifier|db)|slack/events|admin/settings"` → prints nothing.

- [ ] **Step 10: Ship to production**

From the project root (zsh; use an array for the file list):
```bash
R=root@flycheap.18dn.com; D=/opt/egyptair-tracker
FILES=(src/lib/db.ts src/lib/notifier.ts src/lib/cron.ts src/lib/ops/shell.ts src/lib/ops/probes.ts src/lib/ops/card.ts src/lib/ops/agent.ts src/lib/ops/detector.ts src/lib/ops/route.ts src/app/api/slack/events/route.ts src/app/admin/settings/page.tsx src/app/admin/settings/actions.ts deploy/sudoers-egyflights-ops deploy/setup.sh package.json package-lock.json)
ssh $R "mkdir -p $D/src/lib/ops"
for f in "${FILES[@]}"; do scp -q "$f" "$R:$D/$f"; done
ssh $R "cd $D && chown -R egyflights:egyflights src package.json package-lock.json deploy \
  && install -o root -g root -m 0440 deploy/sudoers-egyflights-ops /etc/sudoers.d/egyflights-ops && visudo -cf /etc/sudoers.d/egyflights-ops \
  && bash deploy/deploy.sh 2>&1 | tail -3"
```
Expected: `visudo` prints `parsed OK`; deploy ends with `✓ Deploy successful`.

- [ ] **Step 11: Production acceptance (spec §9), on the box**

Run each and record the outcome in the thread of this plan's execution:

1. **Boundary (negative), before anything else:**
   ```bash
   ssh root@flycheap.18dn.com "sudo -u egyflights sudo -n /usr/bin/systemctl stop caddy; echo exit=\$?; sudo -u egyflights sudo -n /usr/bin/systemctl --failed --no-legend 'egyptair*' | head -3"
   ```
   Expected: the first command prints a sudo refusal and a non-zero exit; the second lists the failed units.
2. **First real run.** Wait for the next `*/5` tick (or `ssh … 'journalctl -u egyptair -f | grep "\[ops\]"'`). Expected: one card per currently failed unit in `#admin_alerts` (there are eight today), each with a diagnosis, and "Fixing: start_job …" where the agent chose to. Units that start clean get "✅ Resolved" on a later tick.
3. **Thread reply → tool.** In one card's thread reply `show me the last 50 lines`. Expected: a reply containing journal output within ~10 s.
4. **Error-log → card.** `ssh root@flycheap.18dn.com "cd /opt/egyptair-tracker && sqlite3 data/fares.db \"INSERT INTO error_log(level,source,message) VALUES('error','ops-test','synthetic error for acceptance')\""`. Expected: a card titled `Errors: ops-test (1 in window)` on the next tick. Then `UPDATE ops_incidents SET last_seen = datetime('now','-61 minutes') WHERE fingerprint LIKE 'err:ops-test:%'` and expect "✅ Resolved" on the following tick.
5. **Gate.** In that thread reply `change poll_interval_minutes to 15`. Expected: a proposal and no change. Reply `go`. Expected: "set poll_interval_minutes: 30 → 15" and an audit row with email `ops-agent`. Reply `go` again: no further change. Then set it back to 30 in Admin → Settings.
6. **Needs-you path.** Temporarily break the key: `sed -i 's/^ANTHROPIC_API_KEY=/ANTHROPIC_API_KEY_OFF=/' /opt/egyptair-tracker/.env.local && systemctl restart egyptair`, insert another synthetic error row. Expected: a card with `*Diagnosis:* unavailable` and no auto-fix; a thread reply gets the "AI assist is unavailable" fallback. Restore the key, restart, reply `done` in the thread: expected a normal agent reply.
7. **Restart path.** In a health or crash-loop card thread (or the synthetic error card) reply `restart the app`. Expected: "Restarting now…" then, within ~1 min, "✅ Back up, health OK." in the same thread.

Clean up: delete the synthetic `error_log` rows and their `ops_incidents` rows; delete the test cards' Slack messages via `chat.delete` if desired.

- [ ] **Step 12: Checkpoint** — record which acceptance items passed; anything that failed goes back to the owning task.

---

## Self-review notes

- Spec §1 probes → Task 4 + Task 8 `gather`. Spec §2 table/queries → Task 2. Spec §3 card → Task 6 + `openCard`. Spec §4 agent, tools, gating, proposal binding, limits → Task 7 (`MAX_TOOL_CALLS`, `RESTART_COOLDOWN_MS`, `DEPLOYED:` once-per-incident). Spec §5 events branch → Task 9 (`routeSlackMessage`). Spec §6 sudoers + shell helper → Task 3 + Task 9 step 8. Spec §7 restart semantics → `restarted` short-circuit in `loop`, `postBootCheck`, and the 60 s timer in cron. Spec §8 failure handling → `tick` try/finally, `postCard` retry, `client: null` fallbacks. Spec §9 tests → Task 9 step 11. Spec §10 settings toggle → Task 9 step 7.
- Names used across tasks: `upsertIncident`, `openIncidents`, `incidentByThread`, `incidentById`, `setIncidentSlackTs`, `setIncidentStatus`, `resolveIncident`, `errorRowsSince`, `failedJobRunsSince`, `latestJobRunOk`, `clearStaleJobLock` (Task 2) are the exact names consumed in Tasks 7–9. `founderChannelId`, `postToSlackThread` (Task 5) are consumed in Tasks 8–9. `commands.*`, `run`, `defaultRunner`, `Runner`, `UNIT_RE` (Task 3) are consumed in Tasks 4, 7, 8.
- Two implementer notes are embedded where the plan's code needs a small adjustment (`getDb` import in Task 7; ESM import of the Anthropic SDK in Task 8).

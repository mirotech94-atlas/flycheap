# Slack ops agent — design

Date: 2026-09-14
Status: approved in chat, pending written review
Scope: FlyCheap Tracker production (`flycheap.18dn.com`), Slack workspace "FlyCheap"

## Goal

When something breaks in production, the founder learns about it in `#admin_alerts`
within five minutes, with a diagnosis. Safe operational fixes happen on their own.
Anything else is proposed in the same Slack thread and runs only after the founder
replies. If the fix needs something only the founder can supply (a key, a decision),
the agent says exactly what it needs and continues once it is provided.

Non-goals: the agent never edits code, never touches billing or user data, never
posts anywhere but `#admin_alerts`, and never receives secrets through Slack.

## Decisions already made

| Decision | Choice |
|---|---|
| Autonomy | Safe ops only. Everything else is proposed and gated on a reply. |
| Channel | `#admin_alerts` (setting `alert_slack_admin_target`, currently `C0B4233G9PE`) only. `#client_alerts` stays the client-alert mirror. |
| Where it runs | Inside the existing Next.js process (approach A). No second service, no second Slack app. |
| Conversation surface | Threads under the incident card. The existing Slack events route gains an ops branch. |
| Model | `claude-sonnet-5` for the ops agent. The client concierge keeps `claude-haiku-4-5-20251001`. |
| Privilege boundary | A sudoers drop-in for the `egyflights` user listing the exact commands. Nothing else is runnable. |
| Secrets | Never via Slack. The agent names the variable and gives a one-line server command; the founder replies `done`. |
| Approval | A human reply in the incident thread. `#admin_alerts` is private to the founder, so any human message there is treated as the founder. |

## Components

### 1. Detector (`src/lib/ops/detector.ts`)

Registered in `startCron()` (`src/lib/cron.ts`) as a `node-cron` task on `*/5 * * * *`.
Each tick runs the four probes below, computes a fingerprint per finding, and
upserts `ops_incidents`. It never throws into the app: the whole tick is wrapped,
and a probe failure is itself logged with `queries.logError({ source: 'ops-detector' })`
but is not turned into an incident (that would loop).

| Probe | Source | Fingerprint | Clears when |
|---|---|---|---|
| Failed job unit | `systemctl --failed --no-legend 'egyptair*'` (via the sudoers-allowed `systemctl` read) | `unit:<name>` | unit no longer listed as failed |
| Failed job run | `job_runs` rows with `ok = 0` newer than the last tick | `job:<job>` | a later `job_runs` row for the same job has `ok = 1` |
| App errors | `error_log` rows with `level = 'error'` newer than the last tick, grouped by `source` + the first 80 chars of `message` after every digit run is replaced by `#` (so `search 12` / `search 13`, `HTTP 500` / `503` group together) | `err:<source>:<sha1 prefix>` | no new matching rows for 60 minutes |
| Health | `GET http://127.0.0.1:3000/api/health` checks with `ok = false` | `health:<check>` | the check reports `ok = true` |
| Crash loop | `journalctl -u egyptair --since '-15min'` shows 3+ service starts | `crashloop` | fewer than 3 starts in the window |

"Last tick" is stored in `settings` under `ops_detector_last_tick` so a restart
does not re-report everything.

### 2. Incident store (`ops_incidents` table, `src/lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS ops_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,          -- unit | job | err | health | crashloop
  title TEXT NOT NULL,
  status TEXT NOT NULL,          -- open | fixing | needs_human | resolved
  slack_ts TEXT,                 -- root message ts in #admin_alerts (thread key)
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  occurrences INTEGER NOT NULL DEFAULT 1,
  last_action TEXT,              -- one line: what the agent last did or asked
  resolved_at TEXT
);
```

Queries: `upsertIncident(fingerprint, source, title)`, `openIncidents()`,
`incidentByThread(slack_ts)`, `setIncidentStatus(id, status, lastAction)`,
`resolveIncident(id)`.

A resolved incident whose fingerprint reappears later becomes a new incident
(new row, new card). The unique constraint is on `fingerprint`, so the old row's
fingerprint is suffixed with `#<id>` on resolve to free the key.

### 3. Card poster (`src/lib/ops/card.ts`)

For a new incident: gather context (last 30 log lines for units, the error rows,
the health payload), ask the ops agent for a diagnosis in read-only mode, and post
one message to `#admin_alerts` via `postFounderSlack('admin', …)`. Store the
returned `ts` as `slack_ts`. Message shape:

```
🔴 *<title>*                                  (e.g. Job failed: egyptair-jobs@digest)
*Since:* 2026-09-14 23:30 UTC · *Seen:* 3×
*What I see:* <2–4 lines from logs>
*Diagnosis:* <agent's one-paragraph read>
*Fixing:* restarting egyptair-jobs@digest          ← safe action, already running
   — or —
*Needs you:* ANTHROPIC_API_KEY is unset. On the server run
   `sed -i 's/^ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=<key>/' /opt/egyptair-tracker/.env.local`
   then reply *done* here and I'll restart the app.
```

Follow-ups go in the thread: "✅ egyptair-jobs@digest ran clean (12 s)",
"⚠️ restart didn't help — here's what changed", "✅ Resolved — clear for 60 min".

### 4. Ops agent (`src/lib/ops/agent.ts`)

Anthropic Messages API with tool use, model `claude-sonnet-5`, max 8 tool rounds
per turn. System prompt states the autonomy rule, the safe/gated split, the secrets
rule, and that it must end every turn with either a one-line status or a
"Needs you:" block.

Entry points:

- `diagnose(incident)` — read-only tools only; used by the card poster.
- `handleThreadReply(incident, threadHistory, message)` — full toolset; invoked
  by the Slack events route for human messages in an incident thread.
- `autoFix(incident)` — safe tools only; invoked by the detector right after the
  card is posted when the diagnosis names a safe action.

Toolset:

| Tool | Class | Implementation |
|---|---|---|
| `read_logs(unit, lines≤200)` | read | `sudo journalctl -u <unit> -n <lines> --no-pager` |
| `read_error_log(limit≤50)` | read | `error_log` newest rows |
| `health_check()` | read | `GET /api/health` on loopback |
| `job_history(job, limit≤20)` | read | `job_runs` rows |
| `list_failed_units()` | read | `sudo systemctl --failed --no-legend 'egyptair*'` |
| `restart_app()` | safe | `sudo systemctl restart egyptair` (posts "restarting now" first; see §7) |
| `start_job(unit)` | safe | `sudo systemctl reset-failed <unit>` then `sudo systemctl start <unit>`; unit must match `^egyptair-(jobs@[a-z0-9-]+|post-video|backup)\.service$` |
| `clear_job_lock(name)` | safe | `DELETE FROM job_locks WHERE name = ?` when `started_at` is older than 30 min |
| `poll_search(id)` | safe | existing `pollSearch(id)` |
| `set_platform_setting(key, value)` | gated | same validation table as the admin Settings page (`EDITABLE` in `src/app/admin/settings/actions.ts`) |
| `redeploy()` | gated | `sudo systemd-run --unit=egyptair-redeploy --collect --no-block /usr/bin/bash /opt/egyptair-tracker/deploy/deploy.sh` — a transient unit, because deploy.sh stops the service that would otherwise be its parent process |

Gated tools are not callable until the current thread contains a human message
after the agent's proposal that matches `^(go|yes|do it|approved)\b` (case-insensitive).
The agent's proposal must name the exact tool and arguments; the approval binds to
that proposal only (stored on the incident as `last_action`), so "go" cannot
approve something proposed later.

Dropped from the earlier chat design: "retry a failed webhook". The
`webhook_events` table stores only event ids for de-duplication, not payloads, so
there is nothing to replay. Provider dashboards resend webhooks; the agent will
say so when relevant.

### 5. Slack events route (`src/app/api/slack/events/route.ts`)

Today: a human message in the support channel (`alert_slack_support_target`) goes
to the concierge. Add a branch before it:

```
if (ev.channel === adminChannel && isHuman && ev.thread_ts) {
  incident = queries.incidentByThread(ev.thread_ts)
  if (incident) → ops agent handleThreadReply (detached promise, ack < 3 s)
}
```

Messages in `#admin_alerts` that are not in an incident thread are ignored (no
bot reply), so the channel stays a quiet notification feed. Bot messages are
ignored as today (`!ev.bot_id`).

Slack app scopes required (already present unless noted): `chat:write`,
`channels:history` (present, history reads work), `channels:read` (missing today;
needed only for nicer channel names, optional).

### 6. Privilege boundary (`/etc/sudoers.d/egyflights-ops`)

```
egyflights ALL=(root) NOPASSWD: \
  /usr/bin/systemctl restart egyptair, \
  /usr/bin/systemctl reset-failed egyptair-jobs@*, /usr/bin/systemctl start egyptair-jobs@*, \
  /usr/bin/systemctl reset-failed egyptair-post-video, /usr/bin/systemctl start egyptair-post-video, \
  /usr/bin/systemctl reset-failed egyptair-backup, /usr/bin/systemctl start egyptair-backup, \
  /usr/bin/systemctl --failed --no-legend egyptair*, \
  /usr/bin/journalctl -u egyptair* -n * --no-pager, /usr/bin/journalctl -u egyptair --since * --no-pager, \
  /usr/bin/systemd-run --unit=egyptair-redeploy --collect --no-block /usr/bin/bash /opt/egyptair-tracker/deploy/deploy.sh
```

Every shell call goes through one helper (`src/lib/ops/shell.ts`) that uses
`execFile` with an argument array (no shell interpolation), validates the unit
name against the regex above, and caps output at 64 KB. If sudo refuses, the tool
returns the refusal text and the agent reports it; nothing retries with different
arguments.

### 7. Restart semantics

`restart_app()` runs inside the process it restarts. Order: post "🔁 Restarting the
app now — I'll confirm in ~1 min" to the thread, mark the incident `fixing`, then
issue the restart. The next detector tick (≤5 min, and a one-shot check 60 s after
boot in `startCron()`) reads `/api/health`; if healthy it posts "✅ Back up, health
OK" and resolves incidents whose fingerprints have cleared. If not, it posts the
failing checks and sets `needs_human`.

`deploy.sh` already snapshots the previous build and rolls back on a failed health
check, so `redeploy()` inherits that safety.

### 8. Failure handling

- Slack unreachable: incident row is created with `slack_ts = NULL`; the next tick
  retries posting. No incident is lost.
- Anthropic unreachable: the card is posted without a diagnosis ("diagnosis
  unavailable") and with no auto-fix; thread replies get "AI assist is down,
  here's the raw log" (same fallback style as the concierge).
- Tool errors: returned to the model as tool results, surfaced verbatim in the
  thread on the final turn.
- Runaway prevention: max 8 tool calls per turn, max one `restart_app` per
  incident per hour, max one `redeploy` per incident.
- Detector overlap: guarded by the existing `job_locks` mechanism (`name =
  'ops-detector'`), released in `finally`.

### 9. Testing (on the production box, throwaway state, cleaned up)

1. **Unit failure → card → auto-fix.** `systemctl start egyptair-jobs@compact`
   with a deliberately broken env (e.g. temporarily point `DB` at a missing path)
   so it fails; observe the card within 5 min; observe the safe restart and the
   "✅" once the env is restored.
2. **Thread reply → tool.** Reply "show me the last 50 lines" in the thread;
   expect a `read_logs` result posted.
3. **Error log → card.** `queries.logError({ source: 'test', message: … })`;
   expect a card; expect "Resolved" after 60 min of silence (verify by
   advancing `ops_detector_last_tick` rather than waiting).
4. **Needs-you path.** Temporarily rename `ANTHROPIC_API_KEY` in `.env.local`,
   trigger an incident, expect the card's "Needs you" block with the exact
   command; restore, reply `done`, expect a restart and "✅".
5. **Gate.** Reply "change poll_interval_minutes to 15" → expect a proposal, no
   change; reply "go" → expect the change and an audit row; reply "go" again →
   expect "nothing pending".
6. **Boundary (negative).** From a shell as `egyflights`, run
   `sudo systemctl stop caddy` → expect a sudo refusal. Ask the agent to "stop
   caddy" → expect it to say it cannot.
7. **Existing failures.** On first deploy the eight units currently failed
   (curator, insights, best-deals, compact, digest, monthly, weekly, post-video)
   will each produce a card. That is the intended first real run.

### 10. Files

New: `src/lib/ops/detector.ts`, `src/lib/ops/agent.ts`, `src/lib/ops/card.ts`,
`src/lib/ops/shell.ts`, `deploy/sudoers-egyflights-ops`.
Changed: `src/lib/db.ts` (table + queries), `src/lib/cron.ts` (register detector +
post-boot check), `src/app/api/slack/events/route.ts` (ops branch),
`src/app/admin/settings/page.tsx` + `actions.ts` (toggle `ops_agent_enabled`,
default on), `deploy/setup.sh` (install the sudoers file).

### 11. Out of scope, noted for later

- Code changes by the agent (explicitly excluded by the autonomy decision).
- Slack DM surface; everything is threads in `#admin_alerts`.
- Metrics/anomaly detection on business numbers (signups dropping, etc.).
- The eight currently failed units: cause unknown, investigate separately.

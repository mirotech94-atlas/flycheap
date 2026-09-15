import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { queries, getDb, type OpsIncidentRow } from '@/lib/db';
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
  { name: 'redeploy', description: 'GATED (needs founder approval). Queue a rebuild + restart via deploy.sh in a detached unit (auto-rolls back on failed health check). The result only confirms it was queued; health is confirmed in the thread after boot.', input_schema: obj({ reason: { type: 'string' } }, ['reason']) },
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
        const rows = getDb().prepare(`SELECT started_at, ok, duration_ms, message FROM job_runs WHERE job = ? ORDER BY started_at DESC LIMIT ?`)
          .all(String(input.job ?? ''), Math.min(20, Number(input.limit ?? 10))) as Array<{ started_at: string; ok: number | null; duration_ms: number | null; message: string | null }>;
        return { content: rows.length ? rows.map(r => `${r.started_at} ${r.ok === 1 ? 'ok' : r.ok === 0 ? 'FAIL' : 'running'} ${r.duration_ms ?? '?'}ms ${r.message ?? ''}`).join('\n') : 'no runs' };
      }
      case 'propose_action': {
        const tool = String(input.tool ?? '');
        if (!SAFE_TOOLS.has(tool) && !GATED_TOOLS.has(tool)) return { content: `cannot propose ${tool}`, is_error: true };
        return { content: `recorded proposal: ${tool}` };
      }
      case 'restart_app': {
        const last = incident.last_restart_at ? Date.parse(incident.last_restart_at) : NaN;
        if (Number.isFinite(last) && now.getTime() - last < RESTART_COOLDOWN_MS) {
          return { content: 'already restarted the app for this incident within the last hour; not restarting again', is_error: true };
        }
        queries.markIncidentRestart(incident.id, now.toISOString());
        queries.setIncidentStatus(incident.id, 'fixing', 'RESTARTED');
        const r = fmt(await run(commands.restartApp(), deps.runner));
        return { ...r, restarted: true };
      }
      case 'start_job': {
        const unit = String(input.unit ?? '');
        const a = await run(commands.resetFailed(unit), deps.runner);
        const b = await run(commands.startUnit(unit), deps.runner);
        if (a.ok && b.ok) queries.setIncidentStatus(incident.id, 'fixing', `STARTED:${unit}`);
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
        if (incident.last_deploy_at) return { content: 'already redeployed once for this incident', is_error: true };
        queries.markIncidentDeploy(incident.id, now.toISOString());
        queries.setIncidentStatus(incident.id, 'fixing', 'DEPLOYED');
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
  let restarted = false, endsTurn = false, toolCalls = 0;
  const modeNote = opts.mode === 'read' ? 'MODE: diagnosis only. Use read tools, then call propose_action once if an action would help, then summarise in 2–4 sentences.'
    : opts.mode === 'safe' ? 'MODE: auto-fix. Run the one safe action you were given, check the result, summarise in one or two lines.'
    : 'MODE: conversation with the founder in the incident thread.';
  for (let i = 0; i < MAX_TOOL_CALLS + 1; i++) {
    let res: Anthropic.Message;
    try {
      res = await deps.client.messages.create({ model: OPS_MODEL, max_tokens: 1200, system: `${SYSTEM}\n\n${modeNote}`, tools: OPS_TOOLS, messages });
    } catch (e) {
      return { text: `AI assist error: ${(e as Error).message}`, restarted, toolCalls };
    }
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
      if ((r as { restarted?: boolean }).restarted) {
        restarted = true;
        // Only restart_app kills the current process mid-turn (its own tool
        // description says "Ends your turn"); redeploy's restart happens via
        // deploy.sh and the loop can keep going to report the outcome.
        if (t.name === 'restart_app') endsTurn = true;
      }
      opts.onTool?.(t.name, input, r);
      results.push({ type: 'tool_result', tool_use_id: t.id, content: r.content, is_error: r.is_error ?? false });
    }
    messages.push({ role: 'user', content: results });
    if (endsTurn) {
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
  let approvedProposal: Proposal | null = null;
  if (pending && approvalGranted(latest)) {
    approvedProposal = pending;
  } else if (pending) {
    // A pending proposal is approvable only by the very next human reply.
    // Anything else (a question, a "not yet", small talk) clears it so a
    // later unrelated "go" can never resurrect a stale proposal.
    queries.setIncidentStatus(incident.id, 'open', null);
    incident = queries.incidentById(incident.id) ?? incident;
  }
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

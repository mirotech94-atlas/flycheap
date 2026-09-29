import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { queries, getDb, type OpsIncidentRow } from '@/lib/db';
import { commands, run, normalizeUnit, type Runner } from './shell';
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
// `client` is the smart model (diagnose/autoFix); `chatClient` is the fast
// model used for conversational turns (handleThreadReply/handleChannelMessage)
// so those stay well under Groq's free-tier per-minute token cap. Falls back
// to `client` when unset (e.g. in tests, or when only one client is wired).
export type AgentDeps = { runner: Runner; client: MessagesClient | null; chatClient?: MessagesClient | null; fetchHealth: () => Promise<HealthJson>; now?: () => Date };

export const OPS_MODEL = 'claude-sonnet-5';
const MAX_TOOL_CALLS = 8;
const RESTART_COOLDOWN_MS = 60 * 60 * 1000;

export const READ_TOOLS: ReadonlySet<string> = new Set(['read_logs', 'read_error_log', 'health_check', 'job_history', 'list_failed_units', 'propose_action']);
export const SAFE_TOOLS: ReadonlySet<string> = new Set(['restart_app', 'start_job', 'clear_job_lock', 'poll_search']);
export const GATED_TOOLS: ReadonlySet<string> = new Set(['set_platform_setting', 'redeploy']);

const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: 'object' as const, properties, required });

export const OPS_TOOLS: Anthropic.Tool[] = [
  { name: 'read_logs', description: 'Last N journal lines for a unit ("egyptair", or an egyptair-jobs@<name> / egyptair-post-video / egyptair-backup unit).', input_schema: obj({ unit: { type: 'string' }, lines: { type: 'integer', minimum: 10, maximum: 200 } }, ['unit']) },
  { name: 'read_error_log', description: 'Newest rows from the app error_log table.', input_schema: obj({ limit: { type: 'integer', minimum: 1, maximum: 50 } }) },
  { name: 'health_check', description: 'GET /api/health on the app.', input_schema: obj({}) },
  { name: 'job_history', description: 'Recent job_runs rows for one job name (e.g. digest, agent-curator).', input_schema: obj({ job: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, ['job']) },
  { name: 'list_failed_units', description: 'systemctl --failed for egyptair* units.', input_schema: obj({}) },
  { name: 'propose_action', description: 'Diagnosis only: name ONE action you recommend. SAFE tools (restart_app, start_job, clear_job_lock, poll_search) run automatically; GATED tools (set_platform_setting, redeploy) go to the founder for approval.', input_schema: obj({ tool: { type: 'string' }, input: { type: 'object' }, reason: { type: 'string' } }, ['tool', 'input', 'reason']) },
  { name: 'restart_app', description: 'SAFE. systemctl restart egyptair; ends your turn.', input_schema: obj({}) },
  { name: 'start_job', description: 'SAFE. reset-failed + start an egyptair-jobs@<name>, egyptair-post-video or egyptair-backup unit.', input_schema: obj({ unit: { type: 'string' } }, ['unit']) },
  { name: 'clear_job_lock', description: 'SAFE. Delete a stuck job_locks row older than 30 minutes.', input_schema: obj({ name: { type: 'string' } }, ['name']) },
  { name: 'poll_search', description: 'SAFE. Re-poll one tracked route by search id.', input_schema: obj({ id: { type: 'integer' } }, ['id']) },
  { name: 'set_platform_setting', description: 'GATED. Change one platform setting (poll_interval_minutes, alert_channels, enabled_providers, price_drop_pct, alert_threshold_per_adult_usd). When addressing multiple open incidents in the channel, pass incident_id to bind the proposal to the incident it concerns (defaults to the newest open one).', input_schema: obj({ key: { type: 'string' }, value: { type: 'string' }, reason: { type: 'string' }, incident_id: { type: 'integer' } }, ['key', 'value', 'reason']) },
  { name: 'redeploy', description: 'GATED. Queue a rebuild + restart via deploy.sh (auto-rolls back on failed health check). When addressing multiple open incidents in the channel, pass incident_id to bind the proposal to the incident it concerns (defaults to the newest open one).', input_schema: obj({ reason: { type: 'string' }, incident_id: { type: 'integer' } }, ['reason']) },
];

/** The tool set offered to the model for a given mode: read tools only in
 * 'read' (propose_action is already one of them), read + safe in 'safe',
 * everything in 'full'. */
export function toolsForMode(mode: OpsMode): Anthropic.Tool[] {
  if (mode === 'read') return OPS_TOOLS.filter(t => READ_TOOLS.has(t.name));
  if (mode === 'safe') return OPS_TOOLS.filter(t => READ_TOOLS.has(t.name) || SAFE_TOOLS.has(t.name));
  return OPS_TOOLS;
}

const MAX_TOKENS_BY_MODE: Record<OpsMode, number> = { read: 500, safe: 400, full: 700 };

/** Cheap token estimate (chars/4) used only to keep a conversational turn's
 * request comfortably under Groq's free-tier per-minute token cap — not a
 * real tokenizer, just a fast, conservative-enough proxy for budgeting. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function requestSize(system: string, tools: Anthropic.Tool[], messages: Anthropic.MessageParam[]): number {
  return estimateTokens(system) + estimateTokens(JSON.stringify(tools)) + estimateTokens(JSON.stringify(messages));
}

const CONVERSATIONAL_BUDGET = 6500;

/** Removes a "Recently resolved:" block (up to the next "Last release:"
 * line, or the end) from a channel-message context string. */
function dropResolvedSection(s: string): string {
  const lines = s.split('\n');
  const start = lines.findIndex(l => l.startsWith('Recently resolved:'));
  if (start === -1) return s;
  let end = lines.findIndex((l, i) => i > start && l.startsWith('Last release:'));
  if (end === -1) end = lines.length;
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
}

/** Keeps only the first `keep` "#..." incident lines under "Open incidents
 * (newest first):", replacing the rest with a count. */
function trimOpenIncidentLines(s: string, keep: number): string {
  const lines = s.split('\n');
  const start = lines.findIndex(l => l.startsWith('Open incidents'));
  if (start === -1) return s;
  let end = lines.findIndex((l, i) => i > start && (l.startsWith('Recently resolved:') || l.startsWith('Last release:')));
  if (end === -1) end = lines.length;
  const body = lines.slice(start + 1, end);
  const incidentLines = body.filter(l => l.startsWith('#'));
  if (incidentLines.length <= keep) return s;
  const omitted = incidentLines.length - keep;
  const newBody = [...incidentLines.slice(0, keep), `…and ${omitted} more open`];
  return [...lines.slice(0, start + 1), ...newBody, ...lines.slice(end)].join('\n');
}

/** Shrinks `messages` in place (within the pre-tool-loop history segment
 * only — never touching later tool_use/tool_result pairs, which must stay
 * intact) until the request fits CONVERSATIONAL_BUDGET, or there is nothing
 * left to trim. Order: drop oldest history messages (keeping the context
 * message at index 0 and the latest user message), then drop the
 * resolved-incidents context, then cap the open-incident list to 5.
 * Returns the updated historyEnd (shrinks as messages are spliced out). */
function fitBudget(system: string, tools: Anthropic.Tool[], messages: Anthropic.MessageParam[], historyEnd: number): number {
  while (requestSize(system, tools, messages) > CONVERSATIONAL_BUDGET && historyEnd > 2) {
    messages.splice(1, 1);
    historyEnd -= 1;
  }
  if (requestSize(system, tools, messages) > CONVERSATIONAL_BUDGET && typeof messages[0]?.content === 'string') {
    messages[0] = { ...messages[0], content: dropResolvedSection(messages[0].content as string) };
  }
  if (requestSize(system, tools, messages) > CONVERSATIONAL_BUDGET && typeof messages[0]?.content === 'string') {
    messages[0] = { ...messages[0], content: trimOpenIncidentLines(messages[0].content as string, 5) };
  }
  return historyEnd;
}

const SETTING_VALIDATORS: Record<string, (v: string) => string | null> = {
  poll_interval_minutes: v => /^\d+$/.test(v) && +v >= 1 && +v <= 1440 ? null : 'whole minutes 1–1440',
  alert_channels: v => v.split(',').map(s => s.trim()).every(s => ['email', 'sms', 'whatsapp', 'telegram', 'slack', 'push'].includes(s)) && v.trim() ? null : 'unknown channel',
  enabled_providers: v => v.split(',').map(s => s.trim()).every(s => ['travelpayouts', 'amadeus', 'serpapi', 'duffel', 'kiwi', 'searchapi'].includes(s)) && v.trim() ? null : 'unknown provider',
  price_drop_pct: v => /^\d+(\.\d+)?$/.test(v) && +v > 0 && +v <= 100 ? null : 'percent 1–100',
  alert_threshold_per_adult_usd: v => /^\d+(\.\d+)?$/.test(v) && +v > 0 && +v <= 100000 ? null : 'positive USD ≤ 100000',
};

// A pending proposal is one the founder has already SEEN — it is shown on the
// incident card (or named in a prior reply) before this reply lands. So any
// clear affirmative here, including "fix it", is them approving THAT specific,
// visible action — never the agent approving something of its own invention.
// A bare "fix it" in the channel with no proposal recorded yet still goes
// through the normal propose-first path (this only fires when `pending` exists).
/**
 * Whether a Slack user may approve a gated action. The channel is not the
 * boundary — anyone invited to #admin_alerts (or any app with chat:write in
 * it) can post "go" — so the approving USER must be on an explicit list:
 * OPS_APPROVER_SLACK_USER_IDS, comma-separated Slack user ids (U…). Unset or
 * empty means nobody can approve: fail closed.
 */
export function isOpsApprover(slackUserId: string | null | undefined): boolean {
  const id = String(slackUserId ?? '').trim();
  if (!id) return false;
  const allowed = (process.env.OPS_APPROVER_SLACK_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return allowed.includes(id);
}

export function approvalGranted(latestHumanText: string): boolean {
  return /^(go|go ahead|yes|yep|yeah|ok|okay|do it|just do it|fix (it|them|that|this)|fix|handle (it|them|that)|sort (it|them) out|resolve (it|them|that)|approved?|proceed)\b/i
    .test(latestHumanText.trim());
}

/** Validates and normalises the input for a proposed SAFE tool, before it is
 * ever recorded as a diagnosis's safeAction or run by auto-fix. Rejects
 * anything not in SAFE_TOOLS (gated/unknown tools are proposals, not
 * auto-fixes, and go through the approval path instead). */
export function validateSafeAction(action: { tool: string; input: Record<string, unknown> }):
  { ok: true; input: Record<string, unknown> } | { ok: false; reason: string } {
  const { tool, input } = action;
  if (!SAFE_TOOLS.has(tool)) return { ok: false, reason: 'not a safe tool' };
  switch (tool) {
    case 'poll_search': {
      const raw = input.id;
      const n = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
      if (!Number.isInteger(n) || n <= 0) return { ok: false, reason: 'poll_search needs a numeric search id' };
      return { ok: true, input: { id: n } };
    }
    case 'start_job': {
      try {
        const unit = normalizeUnit(String(input.unit ?? ''));
        return { ok: true, input: { unit } };
      } catch {
        return { ok: false, reason: 'start_job needs a unit like egyptair-jobs@<name>' };
      }
    }
    case 'clear_job_lock': {
      const name = input.name;
      if (typeof name !== 'string' || !name.trim()) return { ok: false, reason: 'clear_job_lock needs a non-empty name' };
      return { ok: true, input: { name } };
    }
    case 'restart_app':
      return { ok: true, input: {} };
    default:
      return { ok: false, reason: 'not a safe tool' };
  }
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
        if (SAFE_TOOLS.has(tool)) {
          const v = validateSafeAction({ tool, input: (input.input ?? {}) as Record<string, unknown> });
          if (!v.ok) return { content: v.reason, is_error: true };
          return { content: `recorded proposal: ${tool}` };
        }
        if (!GATED_TOOLS.has(tool)) return { content: `cannot propose ${tool}`, is_error: true };
        return { content: `recorded proposal: ${tool}` };
      }
      case 'restart_app': {
        // Global cooldown: a resolved incident frees its fingerprint, so a
        // recurrence is a brand-new row with last_restart_at = NULL — the
        // per-incident check below can't see a restart that happened under a
        // different (now-resolved) incident. This one covers the live site
        // regardless of which incident triggers it.
        const lastGlobal = queries.getSetting('ops_last_restart_at');
        const lastGlobalMs = lastGlobal ? Date.parse(lastGlobal) : NaN;
        if (Number.isFinite(lastGlobalMs) && now.getTime() - lastGlobalMs < RESTART_COOLDOWN_MS) {
          const minsAgo = Math.round((now.getTime() - lastGlobalMs) / 60_000);
          return { content: `the app was restarted ${minsAgo} min ago by the ops agent; not restarting again within the hour`, is_error: true };
        }
        const last = incident.last_restart_at ? Date.parse(incident.last_restart_at) : NaN;
        if (Number.isFinite(last) && now.getTime() - last < RESTART_COOLDOWN_MS) {
          return { content: 'already restarted the app for this incident within the last hour; not restarting again', is_error: true };
        }
        queries.markIncidentRestart(incident.id, now.toISOString());
        queries.setSetting('ops_last_restart_at', now.toISOString());
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
        // In an incident thread this is always ctx.incident. From a channel
        // message there's no single incident bound to the whole turn, so a
        // proposal that concerns a specific (usually older) incident can name
        // it via incident_id; absent that, it defaults to ctx.incident (the
        // newest open one, for channel messages — see handleChannelMessage).
        const boundIncident = (() => {
          const raw = input.incident_id;
          if (raw !== undefined && raw !== null) {
            const id = Number(raw);
            const found = Number.isFinite(id) ? queries.incidentById(id) : undefined;
            if (found) return found;
          }
          return incident;
        })();
        const proposalInput = { ...input };
        delete (proposalInput as { incident_id?: unknown }).incident_id;
        const proposal: Proposal = { tool: name, input: proposalInput, reason: String(input.reason ?? '') };
        delete (proposal.input as { reason?: unknown }).reason;
        const approved = ctx.approvedProposal && ctx.approvedProposal.tool === name && sameInput(ctx.approvedProposal.input, proposal.input);
        if (!approved) {
          queries.setIncidentStatus(boundIncident.id, 'needs_human', `PROPOSAL:${JSON.stringify(proposal)}`);
          return { content: `NEEDS_APPROVAL: I have recorded this proposal on incident #${boundIncident.id} (${boundIncident.title}). Tell the founder exactly what you want to run and why, and ask them to reply "go" in that incident's thread.`, is_error: true, proposal };
        }
        if (name === 'set_platform_setting') {
          const key = String(proposal.input.key ?? ''), value = String(proposal.input.value ?? '');
          const v = SETTING_VALIDATORS[key];
          if (!v) return { content: `setting ${key} is not editable here`, is_error: true };
          const err = v(value);
          if (err) return { content: `invalid value for ${key}: ${err}`, is_error: true };
          const before = queries.getSetting(key) ?? null;
          queries.setSetting(key, value);
          queries.insertAudit({ user_id: null, email: 'ops-agent', action: 'settings.update', entity: `setting:${key}`, detail: { before, after: value, via: 'slack-ops-agent', incident: boundIncident.id }, ip: null });
          queries.setIncidentStatus(boundIncident.id, 'fixing', `SET:${key}=${value}`);
          return { content: `set ${key}: ${before ?? '(unset)'} → ${value}` };
        }
        if (boundIncident.last_deploy_at) return { content: 'already redeployed once for this incident', is_error: true };
        queries.markIncidentDeploy(boundIncident.id, now.toISOString());
        queries.setIncidentStatus(boundIncident.id, 'fixing', 'DEPLOYED');
        return { ...fmt(await run(commands.deploy(), deps.runner)), restarted: true };
      }
    }
  } catch (e) {
    return { content: `tool ${name} threw: ${(e as Error).message}`, is_error: true };
  }
  return { content: `unhandled tool ${name}`, is_error: true };
}

export const SYSTEM = `You are the FlyCheap ops agent — a trusted operator who watches one production server and talks with the founder in Slack. You're not a command parser: you converse. Answer questions, explain your reasoning in plain language, and when the founder asks for context, give it before you propose anything. If a request is ambiguous, ask a brief clarifying question rather than guessing.

Be honest about your limits. You work through Slack text only: you can quote logs, report numbers, run fixes and read the database, but you cannot display images, videos, screenshots or files, and you cannot browse the app UI. If asked to "show" something you can't render (e.g. a video), say so plainly and offer the closest thing you CAN do instead — the file path, the job's status, the last run's output.

How you handle fixes, like any operator who's earned trust:
- Safe fixes (restart_app, start_job, clear_job_lock, poll_search) you can just run when they plausibly fix the problem — don't ask permission for those.
- Anything gated (set_platform_setting, redeploy) you propose first: state the exact tool, arguments, and why in ONE line, then wait for the founder's approval before you run it. Any clear yes approves the proposal you just showed — "go", "yes", "do it", "fix it", "handle it" — so when they say it, run that exact action immediately and report the result; don't ask again. Never run a gated action you haven't shown them first.
- Code, billing, and user data are off-limits — if a fix needs those, say so plainly and stop there.
- If an incident's first_seen is older than the last release, the cause may already be fixed: for failed job units, try start_job to re-run once before escalating further.
- Secrets never go through Slack, ever. If a credential is missing, name the env var and give this exact command, then ask the founder to reply "done":
  sed -i 's/^VAR=.*/VAR=<value>/' /opt/egyptair-tracker/.env.local
- Slack formatting: *bold*, code in backticks, no headers.

Be brief. This is Slack, not a report. Lead with the answer or the result in the first sentence; most replies are 1–3 short sentences. Don't restate their question, don't narrate your steps, don't pad. If you ran something or need them, end with a single "Status:" or "Needs you:" line; a casual question just gets a short answer, no status line.`;

async function loop(opts: {
  incident: OpsIncidentRow; mode: OpsMode; messages: Anthropic.MessageParam[]; deps: AgentDeps;
  approvedProposal: Proposal | null; channel?: boolean; client?: MessagesClient | null;
  onTool?: (name: string, input: Record<string, unknown>, result: ToolResult & { proposal?: Proposal }) => void;
}): Promise<{ text: string | null; restarted: boolean; toolCalls: number; lastToolResult: string | null }> {
  const { deps } = opts;
  const client = opts.client !== undefined ? opts.client : deps.client;
  if (!client) return { text: null, restarted: false, toolCalls: 0, lastToolResult: null };
  const messages = [...opts.messages];
  let historyEnd = messages.length;
  let restarted = false, endsTurn = false, toolCalls = 0, lastToolResult: string | null = null;
  const fullModeNote = 'MODE: you\'re talking with the founder. Reply like a capable colleague — answer what they asked, explain, and act only when it helps. Safe fixes you can just run; gated actions you propose and they approve with \'go\'.';
  const modeNote = opts.channel
    ? `${fullModeNote} You're in the channel, not inside one incident's thread — if they say fix it / fix them / handle it, work through the open incidents newest-first using SAFE tools, one at a time, and report per incident what you ran and the result; propose gated actions with the exact tool and arguments (including incident_id if it is not the newest incident) and ask them to reply "go" in that incident's thread. If nothing is open, say so.`
    : opts.mode === 'read' ? 'MODE: diagnosis only. Use read tools, then call propose_action once if an action would help, then summarise in 2–4 sentences.'
    : opts.mode === 'safe' ? 'MODE: auto-fix. Run the one safe action you were given, check the result, summarise in one or two lines.'
    : fullModeNote;
  const system = `${SYSTEM}\n\n${modeNote}`;
  const tools = toolsForMode(opts.mode);
  for (let i = 0; i < MAX_TOOL_CALLS + 1; i++) {
    historyEnd = fitBudget(system, tools, messages, historyEnd);
    let res: Anthropic.Message;
    try {
      res = await client.messages.create({ model: OPS_MODEL, max_tokens: MAX_TOKENS_BY_MODE[opts.mode], system, tools, messages });
    } catch (e) {
      return { text: `AI assist error: ${(e as Error).message}`, restarted, toolCalls, lastToolResult };
    }
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim();
    if (res.stop_reason !== 'tool_use') return { text: text || null, restarted, toolCalls, lastToolResult };
    messages.push({ role: 'assistant', content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')) {
      toolCalls += 1;
      const input = (t.input ?? {}) as Record<string, unknown>;
      const r = toolCalls > MAX_TOOL_CALLS
        ? { content: 'tool budget exhausted for this turn; summarise now', is_error: true }
        : await runOpsTool(t.name, input, { incident: queries.incidentById(opts.incident.id) ?? opts.incident, mode: opts.mode, approvedProposal: opts.approvedProposal, deps });
      lastToolResult = r.content.slice(0, 300);
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
      return { text: text || 'Restarting now — I will confirm health after boot.', restarted, toolCalls, lastToolResult };
    }
  }
  return { text: 'Stopping: too many tool calls this turn.', restarted, toolCalls, lastToolResult };
}

/** Free-text line describing the last successful deploy (written by
 * deploy/deploy.sh via `ops_last_release`), included in every diagnosis
 * context so the model can tell whether an incident predates a fix. */
function lastReleaseLine(): string {
  const v = queries.getSetting('ops_last_release');
  return `Last release: ${v ?? '(unknown)'}`;
}

/** Humanises the time since `firstSeen` (a sqlite "YYYY-MM-DD HH:MM:SS" UTC
 * timestamp) as a short age like "45m", "3h" or "2d". */
function humanizeAge(firstSeen: string, now: Date): string {
  const then = Date.parse(`${firstSeen.replace(' ', 'T')}Z`);
  if (!Number.isFinite(then)) return '?';
  const minutes = Math.max(0, Math.floor((now.getTime() - then) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** One compact line for an incident — `#<id> <title> — <status>, <age>` —
 * used everywhere a conversational turn needs incident context WITHOUT the
 * full card (no last_action, evidence or logs): that's what blows a
 * Groq free-tier request's token budget. */
export function compactIncident(row: OpsIncidentRow, now: Date = new Date()): string {
  return `#${row.id} ${row.title} — ${row.status}, ${humanizeAge(row.first_seen, now)}`;
}

/** Removes fenced code blocks (the giant log dumps that bloat a thread's
 * history) from a message's content. */
function stripCodeFences(s: string): string {
  return s.replace(/```[\s\S]*?```/g, '[code omitted]');
}

export async function diagnose(incident: OpsIncidentRow, evidence: string, deps: AgentDeps):
  Promise<{ text: string | null; safeAction: { tool: string; input: Record<string, unknown> } | null }> {
  let safeAction: { tool: string; input: Record<string, unknown> } | null = null;
  const r = await loop({
    incident, mode: 'read', deps, approvedProposal: null, client: deps.client,
    messages: [{ role: 'user', content: `Incident: ${incident.title}\nSource: ${incident.source}\nSeen ${incident.occurrences}× since ${incident.first_seen} UTC.\n${lastReleaseLine()}\n\nEvidence:\n${evidence || '(none gathered)'}` }],
    onTool: (name, input) => {
      if (name !== 'propose_action') return;
      const tool = String(input.tool);
      const v = validateSafeAction({ tool, input: (input.input ?? {}) as Record<string, unknown> });
      if (v.ok) safeAction = { tool, input: v.input };
    },
  });
  return { text: r.text, safeAction };
}

export async function autoFix(incident: OpsIncidentRow, action: { tool: string; input: Record<string, unknown> }, deps: AgentDeps):
  Promise<{ text: string; restarted: boolean }> {
  if (!SAFE_TOOLS.has(action.tool)) return { text: `refusing to auto-run ${action.tool}`, restarted: false };
  const r = await loop({
    incident, mode: 'safe', deps, approvedProposal: null, client: deps.client,
    messages: [{ role: 'user', content: `Run this safe action now and report: ${action.tool} ${JSON.stringify(action.input)}` }],
  });
  return { text: r.text ?? r.lastToolResult ?? 'done', restarted: r.restarted };
}

export async function handleThreadReply(
  incident: OpsIncidentRow, thread: ThreadMsg[], latest: string, deps: AgentDeps,
  /** Slack user id of whoever wrote `latest`. Only listed approvers can approve. */
  authorSlackUserId?: string | null,
): Promise<{ text: string; restarted: boolean }> {
  const pending = parseProposal(incident.last_action);
  // A pending proposal is approvable only by the very next human reply, and
  // only once: whether this reply approves it or not, it is consumed here
  // (before the loop runs) so a later unrelated "go" can never resurrect a
  // stale proposal, and the same proposal can never be replayed twice. The
  // reply must also come from a listed approver, not merely from the channel.
  const approvedProposal: Proposal | null =
    pending && approvalGranted(latest) && isOpsApprover(authorSlackUserId) ? pending : null;
  if (pending) {
    queries.setIncidentStatus(incident.id, 'open', null);
    incident = queries.incidentById(incident.id) ?? incident;
  }
  const now = deps.now?.() ?? new Date();
  // Keep only the last 6 thread messages, strip fenced code blocks (the
  // incident card's giant log block) from every one of them except the
  // most recent, and cap each to 500 chars — the single biggest source of
  // token bloat in a conversational turn.
  const recent = thread.slice(-6);
  const lastRaw = recent[recent.length - 1];
  const trimmedThread = recent.map((m, i) => {
    const isMostRecent = i === recent.length - 1;
    const content = (isMostRecent ? m.content : stripCodeFences(m.content)).slice(0, 500);
    return { role: m.role, content };
  });
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `${compactIncident(incident, now)}\n${lastReleaseLine()}` },
    ...trimmedThread,
  ];
  // Compare against the untrimmed thread tail — dedup must not be fooled by
  // the 500-char cap just applied above.
  const alreadyEndsWithLatest = lastRaw?.role === 'user' && lastRaw.content === latest;
  if (!alreadyEndsWithLatest) {
    messages.push({ role: 'user', content: latest });
  }
  if (approvedProposal) {
    messages.push({ role: 'user', content: `[system] The founder approved your pending proposal exactly as recorded: ${JSON.stringify(approvedProposal)}. Call that tool with those arguments now, then report.` });
  }
  const r = await loop({ incident, mode: 'full', deps, approvedProposal, messages, client: deps.chatClient ?? deps.client });
  return { text: r.text ?? 'AI assist is unavailable right now; here is nothing new. Reply again later.', restarted: r.restarted };
}

// Used only when handleChannelMessage runs with zero open incidents: SAFE/
// GATED tools bind their bookkeeping to ctx.incident, and id 0 never matches
// a real row, so any such call is a harmless no-op — matching the system
// prompt's instruction not to act when nothing is open.
const NO_OPEN_INCIDENT: OpsIncidentRow = {
  id: 0, fingerprint: '', source: '', title: '(no open incidents)', status: 'resolved',
  slack_ts: null, first_seen: '', last_seen: '', occurrences: 0,
  last_action: null, last_restart_at: null, last_deploy_at: null, resolved_at: null,
};

/** A root message in #admin_alerts (not a reply inside an incident thread) —
 * the founder addressing the ops agent in the channel, e.g. "fix it". Builds
 * its own context from every open incident (newest first) plus the last few
 * resolved ones, since there is no single incident this message is about. */
export async function handleChannelMessage(text: string, deps: AgentDeps): Promise<{ text: string; restarted: boolean }> {
  const now = deps.now?.() ?? new Date();
  const openNewestFirst = [...queries.openIncidents()].reverse();
  const resolved = queries.recentResolvedIncidents(3);
  const lines: string[] = ['Open incidents (newest first):'];
  if (openNewestFirst.length) {
    // Compact one-liners only (no last_action/evidence/logs), capped at 8 —
    // a channel message's context is otherwise the biggest source of token
    // bloat once more than a handful of incidents are open.
    const shown = openNewestFirst.slice(0, 8);
    for (const inc of shown) lines.push(compactIncident(inc, now));
    if (openNewestFirst.length > shown.length) lines.push(`…and ${openNewestFirst.length - shown.length} more open`);
  } else {
    lines.push('(none)');
  }
  lines.push('Recently resolved:');
  if (resolved.length) {
    for (const inc of resolved) lines.push(compactIncident(inc, now));
  } else {
    lines.push('(none)');
  }
  const context = lines.join('\n');
  const r = await loop({
    incident: openNewestFirst[0] ?? NO_OPEN_INCIDENT,
    mode: 'full',
    channel: true,
    deps,
    approvedProposal: null,
    messages: [{ role: 'user', content: `${context}\n${lastReleaseLine()}\n\nFounder message in #admin_alerts: ${text}` }],
    client: deps.chatClient ?? deps.client,
  });
  return { text: r.text ?? 'AI assist is unavailable right now; here is nothing new. Reply again later.', restarted: r.restarted };
}

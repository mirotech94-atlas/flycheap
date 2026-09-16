import { describe, it, expect, beforeAll } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { bootTempDb } from '../helpers/tempDb';

let db: Awaited<ReturnType<typeof bootTempDb>>;
let agent: typeof import('@/lib/ops/agent');
beforeAll(async () => { db = await bootTempDb(); agent = await import('@/lib/ops/agent'); });

const calls: Array<[string, string[]]> = [];
const runner = async (file: string, args: string[]) => { calls.push([file, args]); return { ok: true, code: 0, stdout: `ran ${args.join(' ')}`, stderr: '' }; };
const deps = () => ({ runner, client: null, fetchHealth: async () => ({ ok: true, checks: {} }) });
/** deps() with an injected clock, for deterministic cooldown tests. */
const depsAt = (iso: string) => ({ ...deps(), now: () => new Date(iso) });

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

describe('toolsForMode', () => {
  it('read mode offers only read tools (propose_action included, no restart_app/redeploy)', () => {
    const names = agent.toolsForMode('read').map(t => t.name);
    expect(names).toEqual(expect.arrayContaining(['read_logs', 'read_error_log', 'health_check', 'job_history', 'list_failed_units', 'propose_action']));
    expect(names).not.toEqual(expect.arrayContaining(['restart_app', 'start_job', 'clear_job_lock', 'poll_search', 'set_platform_setting', 'redeploy']));
  });
  it('safe mode offers read + safe tools but no gated tools', () => {
    const names = agent.toolsForMode('safe').map(t => t.name);
    expect(names).toEqual(expect.arrayContaining(['read_logs', 'health_check', 'restart_app', 'start_job', 'clear_job_lock', 'poll_search']));
    expect(names).not.toEqual(expect.arrayContaining(['set_platform_setting', 'redeploy']));
  });
  it('full mode offers every tool', () => {
    const names = agent.toolsForMode('full').map(t => t.name);
    expect(names.sort()).toEqual(agent.OPS_TOOLS.map(t => t.name).sort());
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
    db.queries.setSetting('ops_last_restart_at', new Date(Date.now() - 2 * 60 * 60_000).toISOString());
    const { row } = db.queries.upsertIncident('health:last_poll', 'health', 't');
    const a = await agent.runOpsTool('restart_app', {}, { incident: row, mode: 'safe', approvedProposal: null, deps: deps() });
    expect(a.restarted).toBe(true);
    // Push the global cooldown back out of the way so this assertion is
    // about the per-incident cooldown specifically, not the global one
    // (both would otherwise refuse the same way since 'a' just set both to
    // the same timestamp).
    db.queries.setSetting('ops_last_restart_at', new Date(Date.now() - 2 * 60 * 60_000).toISOString());
    const b = await agent.runOpsTool('restart_app', {}, { incident: db.queries.incidentById(row.id)!, mode: 'safe', approvedProposal: null, deps: deps() });
    expect(b.is_error).toBe(true);
    expect(b.content).toContain('already restarted');
  });
  it('restart_app cooldown survives other bookkeeping (start_job) on the same incident', async () => {
    db.queries.setSetting('ops_last_restart_at', new Date(Date.now() - 2 * 60 * 60_000).toISOString());
    const { row } = db.queries.upsertIncident('health:other_bookkeeping', 'health', 't');
    const a = await agent.runOpsTool('restart_app', {}, { incident: row, mode: 'safe', approvedProposal: null, deps: deps() });
    expect(a.restarted).toBe(true);
    db.queries.setSetting('ops_last_restart_at', new Date(Date.now() - 2 * 60 * 60_000).toISOString());
    await agent.runOpsTool('start_job', { unit: 'egyptair-jobs@digest' }, { incident: db.queries.incidentById(row.id)!, mode: 'safe', approvedProposal: null, deps: deps() });
    const c = await agent.runOpsTool('restart_app', {}, { incident: db.queries.incidentById(row.id)!, mode: 'safe', approvedProposal: null, deps: deps() });
    expect(c.is_error).toBe(true);
    expect(c.content).toContain('already restarted');
  });
  it('global cooldown refuses a restart on a different incident within the hour', async () => {
    db.queries.setSetting('ops_last_restart_at', '2020-01-01T00:00:00.000Z');
    const { row: row1 } = db.queries.upsertIncident('unit:global-cooldown-a', 'unit', 't');
    const a = await agent.runOpsTool('restart_app', {}, { incident: row1, mode: 'safe', approvedProposal: null, deps: depsAt('2026-01-01T00:00:00.000Z') });
    expect(a.restarted).toBe(true);
    // A fresh incident (last_restart_at is NULL) — the per-incident check
    // alone would allow this; only the global cooldown refuses it.
    const { row: row2 } = db.queries.upsertIncident('unit:global-cooldown-b', 'unit', 't');
    const b = await agent.runOpsTool('restart_app', {}, { incident: row2, mode: 'safe', approvedProposal: null, deps: depsAt('2026-01-01T00:30:00.000Z') });
    expect(b.is_error).toBe(true);
    expect(b.content).toContain('not restarting again within the hour');
  });
  it('a global cooldown older than an hour allows a restart', async () => {
    db.queries.setSetting('ops_last_restart_at', '2026-01-01T00:00:00.000Z');
    const { row } = db.queries.upsertIncident('unit:global-cooldown-c', 'unit', 't');
    const r = await agent.runOpsTool('restart_app', {}, { incident: row, mode: 'safe', approvedProposal: null, deps: depsAt('2026-01-01T02:30:00.000Z') });
    expect(r.restarted).toBe(true);
  });
  it('safe mode refuses redeploy (a gated tool) with an approval-related error', async () => {
    const { row } = db.queries.upsertIncident('err:g:h', 'err', 't');
    const r = await agent.runOpsTool('redeploy', { reason: 'x' }, { incident: row, mode: 'safe', approvedProposal: null, deps: deps() });
    expect(r.is_error).toBe(true);
    expect(r.content).toContain('approval');
  });
  it('redeploy runs once per incident then refuses a second approved redeploy', async () => {
    const { row } = db.queries.upsertIncident('err:i:j', 'err', 't');
    const approved = { tool: 'redeploy' as const, input: {}, reason: 'r' };
    calls.length = 0;
    const first = await agent.runOpsTool('redeploy', {}, { incident: row, mode: 'full', approvedProposal: approved, deps: deps() });
    expect(first.is_error).toBeFalsy();
    expect(calls).toHaveLength(1);
    const second = await agent.runOpsTool('redeploy', {}, { incident: db.queries.incidentById(row.id)!, mode: 'full', approvedProposal: approved, deps: deps() });
    expect(second.is_error).toBe(true);
    expect(second.content).toContain('already redeployed');
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
    expect(d.safeAction).toEqual({ tool: 'start_job', input: { unit: 'egyptair-jobs@compact.service' } });
  });
  it('diagnose with no client returns unavailable', async () => {
    const { row } = db.queries.upsertIncident('unit:y', 'unit', 't');
    const d = await agent.diagnose(row, 'e', deps());
    expect(d).toEqual({ text: null, safeAction: null });
  });
  it('diagnose includes the last release in the first user message when ops_last_release is set', async () => {
    db.queries.setSetting('ops_last_release', '52cee4e 2026-09-16 14:45 UTC — channel commands');
    let capturedMessages: Anthropic.MessageParam[] | null = null;
    const client: import('@/lib/ops/agent').MessagesClient = { messages: { create: async (p) => {
      capturedMessages = p.messages as Anthropic.MessageParam[];
      return { id: 'm', type: 'message', role: 'assistant', model: 'x', content: [{ type: 'text', text: 'ok', citations: null }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } as unknown as Anthropic.Message;
    } } };
    const { row } = db.queries.upsertIncident('unit:release-aware', 'unit', 't');
    await agent.diagnose(row, 'evidence', { ...deps(), client });
    const firstUserMsg = capturedMessages![0];
    expect(String(firstUserMsg.content)).toContain('Last release:');
    expect(String(firstUserMsg.content)).toContain('52cee4e 2026-09-16 14:45 UTC — channel commands');
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
    expect(calls.map(c => c[1].join(' '))).toEqual(['/usr/bin/systemd-run --unit=egyptair-redeploy --collect --no-block /usr/bin/bash /opt/egyptair-tracker/deploy/deploy.sh']);
    expect(db.queries.incidentById(row.id)?.status).toBe('fixing');
  });
  it('a pending proposal is approvable only by the very next human reply', async () => {
    const { row } = db.queries.upsertIncident('err:k:l', 'err', 't');
    db.queries.setIncidentStatus(row.id, 'needs_human', 'PROPOSAL:{"tool":"redeploy","input":{},"reason":"fix"}');
    calls.length = 0;
    const textOnlyClient = scripted([[{ type: 'text', text: 'Here are the logs.', citations: null }]] as unknown as Array<Anthropic.Message['content']>);
    const r1 = await agent.handleThreadReply(db.queries.incidentById(row.id)!, [], 'show me the logs first', { ...deps(), client: textOnlyClient });
    expect(r1.text).toBe('Here are the logs.');
    expect(calls).toEqual([]);
    const cleared = db.queries.incidentById(row.id)!;
    expect(cleared.last_action).toBeNull();
    expect(cleared.status).toBe('open');

    // A later "go" cannot resurrect the cleared proposal: with no pending
    // proposal, handleThreadReply passes approvedProposal: null and no
    // "[system] approved" message, so nothing gated ever runs.
    const secondClient = scripted([[{ type: 'text', text: 'Nothing pending to approve.', citations: null }]] as unknown as Array<Anthropic.Message['content']>);
    const r2 = await agent.handleThreadReply(cleared, [], 'go', { ...deps(), client: secondClient });
    expect(r2.text).toBe('Nothing pending to approve.');
    expect(calls).toEqual([]);
    expect(db.queries.incidentById(row.id)?.status).toBe('open');
  });
  it('an approval is single-use: a second "go" after the proposal was already consumed runs nothing', async () => {
    const { row } = db.queries.upsertIncident('err:m:n', 'err', 't');
    db.queries.setIncidentStatus(row.id, 'needs_human', 'PROPOSAL:{"tool":"redeploy","input":{},"reason":"fix"}');
    calls.length = 0;
    // First "go": the model only replies with text, never calling the tool
    // (e.g. it decided to ask a follow-up instead). The proposal must be
    // consumed regardless — approval or not — so it can't be replayed.
    const textOnlyClient = scripted([[{ type: 'text', text: 'One moment.', citations: null }]] as unknown as Array<Anthropic.Message['content']>);
    const r1 = await agent.handleThreadReply(db.queries.incidentById(row.id)!, [], 'go', { ...deps(), client: textOnlyClient });
    expect(r1.text).toBe('One moment.');
    expect(calls).toEqual([]);
    expect(db.queries.incidentById(row.id)?.last_action).toBeNull();
    expect(db.queries.incidentById(row.id)?.status).toBe('open');

    // Second "go": a scripted client that WOULD call redeploy if given the
    // chance. Since the proposal was already consumed by the first reply,
    // approvedProposal is null this time and the runner must see no deploy
    // command.
    calls.length = 0;
    const deployClient = scripted([
      [{ type: 'tool_use', id: 't2', name: 'redeploy', input: {} }],
      [{ type: 'text', text: 'Deployed.', citations: null }],
    ] as unknown as Array<Anthropic.Message['content']>);
    const r2 = await agent.handleThreadReply(db.queries.incidentById(row.id)!, [], 'go', { ...deps(), client: deployClient });
    expect(r2.text).toBeTruthy();
    expect(calls).toEqual([]);
  });
});

describe('validateSafeAction', () => {
  it('poll_search requires a positive integer id, coercing numeric strings', () => {
    expect(agent.validateSafeAction({ tool: 'poll_search', input: { id: 7 } })).toEqual({ ok: true, input: { id: 7 } });
    expect(agent.validateSafeAction({ tool: 'poll_search', input: { id: '7' } })).toEqual({ ok: true, input: { id: 7 } });
    expect(agent.validateSafeAction({ tool: 'poll_search', input: {} })).toEqual({ ok: false, reason: 'poll_search needs a numeric search id' });
    expect(agent.validateSafeAction({ tool: 'poll_search', input: { id: 'abc' } })).toEqual({ ok: false, reason: 'poll_search needs a numeric search id' });
    expect(agent.validateSafeAction({ tool: 'poll_search', input: { id: -1 } })).toEqual({ ok: false, reason: 'poll_search needs a numeric search id' });
    expect(agent.validateSafeAction({ tool: 'poll_search', input: { id: 1.5 } })).toEqual({ ok: false, reason: 'poll_search needs a numeric search id' });
  });
  it('start_job normalises a valid unit and rejects a bad one', () => {
    expect(agent.validateSafeAction({ tool: 'start_job', input: { unit: 'egyptair-jobs@digest' } })).toEqual({ ok: true, input: { unit: 'egyptair-jobs@digest.service' } });
    expect(agent.validateSafeAction({ tool: 'start_job', input: { unit: 'caddy' } })).toEqual({ ok: false, reason: 'start_job needs a unit like egyptair-jobs@<name>' });
    expect(agent.validateSafeAction({ tool: 'start_job', input: {} })).toEqual({ ok: false, reason: 'start_job needs a unit like egyptair-jobs@<name>' });
  });
  it('clear_job_lock requires a non-empty name', () => {
    expect(agent.validateSafeAction({ tool: 'clear_job_lock', input: { name: 'digest' } })).toEqual({ ok: true, input: { name: 'digest' } });
    expect(agent.validateSafeAction({ tool: 'clear_job_lock', input: { name: '' } })).toEqual({ ok: false, reason: 'clear_job_lock needs a non-empty name' });
    expect(agent.validateSafeAction({ tool: 'clear_job_lock', input: {} })).toEqual({ ok: false, reason: 'clear_job_lock needs a non-empty name' });
  });
  it('restart_app needs no input', () => {
    expect(agent.validateSafeAction({ tool: 'restart_app', input: {} })).toEqual({ ok: true, input: {} });
    expect(agent.validateSafeAction({ tool: 'restart_app', input: { whatever: 1 } })).toEqual({ ok: true, input: {} });
  });
  it('rejects anything not in SAFE_TOOLS', () => {
    expect(agent.validateSafeAction({ tool: 'redeploy', input: {} })).toEqual({ ok: false, reason: 'not a safe tool' });
    expect(agent.validateSafeAction({ tool: 'bogus', input: {} })).toEqual({ ok: false, reason: 'not a safe tool' });
  });
});

describe('propose_action validation', () => {
  it('propose_action with poll_search {} returns an error result and diagnose yields safeAction: null', async () => {
    const { row } = db.queries.upsertIncident('unit:no-id', 'unit', 't');
    const r = await agent.runOpsTool('propose_action', { tool: 'poll_search', input: {}, reason: 'x' }, { incident: row, mode: 'read', approvedProposal: null, deps: deps() });
    expect(r.is_error).toBe(true);
    expect(r.content).toBe('poll_search needs a numeric search id');

    const client = scripted([
      [{ type: 'tool_use', id: 't1', name: 'propose_action', input: { tool: 'poll_search', input: {}, reason: 'x' } }],
      [{ type: 'text', text: 'Could not identify a search id.', citations: null }],
    ] as unknown as Array<Anthropic.Message['content']>);
    const d = await agent.diagnose(row, 'evidence', { ...deps(), client });
    expect(d.safeAction).toBeNull();
  });
  it('a diagnosis that first proposes without id, then with { id: 7 }, yields the corrected safeAction', async () => {
    const { row } = db.queries.upsertIncident('unit:corrects-itself', 'unit', 't');
    const client = scripted([
      [{ type: 'tool_use', id: 't1', name: 'propose_action', input: { tool: 'poll_search', input: {}, reason: 'first try' } }],
      [{ type: 'tool_use', id: 't2', name: 'propose_action', input: { tool: 'poll_search', input: { id: 7 }, reason: 'corrected' } }],
      [{ type: 'text', text: 'Re-polling search 7.', citations: null }],
    ] as unknown as Array<Anthropic.Message['content']>);
    const d = await agent.diagnose(row, 'evidence', { ...deps(), client });
    expect(d.safeAction).toEqual({ tool: 'poll_search', input: { id: 7 } });
  });
});

describe('handleChannelMessage', () => {
  it('builds context containing every open incident title', async () => {
    for (const inc of db.queries.openIncidents()) db.queries.resolveIncident(inc.id);
    db.queries.upsertIncident('unit:channel-a', 'unit', 'Job failed: channel-a');
    db.queries.upsertIncident('unit:channel-b', 'unit', 'Job failed: channel-b');
    let seenContext = '';
    const client: import('@/lib/ops/agent').MessagesClient = {
      messages: { create: async (p) => {
        seenContext = String((p.messages[0] as { content: string }).content);
        return { id: 'm', type: 'message', role: 'assistant', model: 'x', content: [{ type: 'text', text: 'Two open, nothing actioned.', citations: null }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } as unknown as Anthropic.Message;
      } },
    };
    const r = await agent.handleChannelMessage('status?', { ...deps(), client });
    expect(seenContext).toContain('Job failed: channel-a');
    expect(seenContext).toContain('Job failed: channel-b');
    expect(r.text).toBe('Two open, nothing actioned.');
  });

  it('"fix it" with a client that starts a failed job runs reset-failed + start and reports a status line', async () => {
    for (const inc of db.queries.openIncidents()) db.queries.resolveIncident(inc.id);
    db.queries.upsertIncident('unit:channel-fix', 'unit', 'Job failed: channel-fix');
    calls.length = 0;
    const client = scripted([
      [{ type: 'tool_use', id: 't1', name: 'start_job', input: { unit: 'egyptair-jobs@channel-fix' } }],
      [{ type: 'text', text: 'Ran start_job on channel-fix and it recovered. Status: 1 incident fixed, 0 open.', citations: null }],
    ] as unknown as Array<Anthropic.Message['content']>);
    const r = await agent.handleChannelMessage('fix it', { ...deps(), client });
    expect(calls.map(c => c[1].join(' '))).toEqual([
      '/usr/bin/systemctl reset-failed egyptair-jobs@channel-fix.service',
      '/usr/bin/systemctl start egyptair-jobs@channel-fix.service',
    ]);
    expect(r.text).toContain('Status:');
  });

  it('says so when nothing is open', async () => {
    for (const inc of db.queries.openIncidents()) db.queries.resolveIncident(inc.id);
    const client = scripted([[{ type: 'text', text: 'Nothing open right now.', citations: null }]] as unknown as Array<Anthropic.Message['content']>);
    const r = await agent.handleChannelMessage('fix it', { ...deps(), client });
    expect(r.text).toBe('Nothing open right now.');
  });
});

describe('SYSTEM prompt is conversational', () => {
  it('is honest about not being able to show images/video, and does not force a status line on casual replies', () => {
    expect(agent.SYSTEM).toMatch(/cannot display images, videos, screenshots or files/i);
    expect(agent.SYSTEM).toMatch(/casual question.*don't force a status line/i);
  });
});

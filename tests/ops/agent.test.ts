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

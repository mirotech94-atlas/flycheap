import { describe, it, expect, beforeAll } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
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

/** Resolve every currently-open incident, so a test's assertions about
 * exactly-what-happened-this-tick aren't polluted by another test's
 * leftover state (tests in this file share one db instance). */
function resetIncidents() {
  for (const inc of db.queries.openIncidents()) db.queries.resolveIncident(inc.id);
}

/** Scripted fake Anthropic client: returns the given messages in order
 * (same pattern as tests/ops/agent.test.ts). */
function scripted(turns: Array<Anthropic.Message['content']>): import('@/lib/ops/agent').MessagesClient {
  let i = 0;
  return { messages: { create: async () => {
    const content = turns[Math.min(i++, turns.length - 1)];
    const stop_reason = content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn';
    return { id: 'm', type: 'message', role: 'assistant', model: 'x', content, stop_reason, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } as unknown as Anthropic.Message;
  } } };
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

  it('groups two error rows with the same fingerprint into one incident with occurrences 2', async () => {
    resetIncidents();
    db.queries.logError({ source: 'jobRunner', message: 'disk pressure' });
    db.queries.logError({ source: 'jobRunner', message: 'disk pressure' });
    const r = await det.tick(io().io);
    expect(r.created).toBe(1);
    const errIncidents = db.queries.openIncidents().filter(i => i.source === 'err');
    expect(errIncidents).toHaveLength(1);
    expect(errIncidents[0].title).toBe('Errors: jobRunner (2 in window)');
    expect(errIncidents[0].occurrences).toBe(2);
  });

  it('a tick with no new error rows leaves the error cursor unchanged', async () => {
    const before = db.queries.getSetting('ops_detector_last_error_id');
    await det.tick(io().io);
    expect(db.queries.getSetting('ops_detector_last_error_id')).toBe(before);
  });

  it('retries a card whose post failed earlier', async () => {
    resetIncidents();
    let fail = true;
    const h = io({ failed: '● egyptair-post-video.service loaded failed failed x', postCard: async () => (fail ? null : 'ts.9') });
    await det.tick(h.io);
    expect(db.queries.openIncidents()[0].slack_ts).toBeNull();
    fail = false;
    const r = await det.tick(h.io);
    expect(r.posted).toBe(1);
    expect(db.queries.openIncidents()[0].slack_ts).toBe('ts.9');
  });

  it('resolves an incident whose card never posted, without ever posting a card or a resolved message for it', async () => {
    resetIncidents();
    const h1 = io({ failed: '● egyptair-jobs@housekeeping.service loaded failed failed x', postCard: async () => null });
    await det.tick(h1.io);
    const inc = db.queries.openIncidents().find(i => i.fingerprint === 'unit:egyptair-jobs@housekeeping.service')!;
    expect(inc).toBeTruthy();
    expect(inc.slack_ts).toBeNull();

    const h2 = io({ failed: '' });
    const r = await det.tick(h2.io);
    expect(r.resolved).toBe(1);
    expect(db.queries.incidentById(inc.id)?.status).toBe('resolved');
    expect(h2.cards).toEqual([]);
    expect(h2.threads).toEqual([]);
  });

  it('resolves a job incident once the latest run for that job is ok', async () => {
    resetIncidents();
    const failId = db.queries.insertJobRun('digest');
    db.queries.finishJobRun(failId, false, 12, 'SMTP down');
    const h1 = io();
    await det.tick(h1.io);
    const inc = db.queries.openIncidents().find(i => i.fingerprint === 'job:digest')!;
    expect(inc).toBeTruthy();
    expect(inc.slack_ts).toBe('ts.1');

    const okId = db.queries.insertJobRun('digest');
    db.queries.finishJobRun(okId, true, 5, 'ok');
    const h2 = io();
    const r = await det.tick(h2.io);
    expect(r.resolved).toBe(1);
    expect(h2.threads).toEqual([['ts.1', expect.stringContaining('✅ Resolved')]]);
    expect(db.queries.incidentById(inc.id)?.status).toBe('resolved');
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

  it('a restart_app auto-fix short-circuits the tick with skipped "restarting", even when posting the follow-up thread message fails', async () => {
    resetIncidents();
    const calls: Array<[string, string[]]> = [];
    const client = scripted([
      [{ type: 'tool_use', id: 't1', name: 'propose_action', input: { tool: 'restart_app', input: {}, reason: 'app looks wedged' } }],
      [{ type: 'text', text: 'Restarting the app.', citations: null }],
      [{ type: 'tool_use', id: 't2', name: 'restart_app', input: {} }],
    ] as unknown as Array<Anthropic.Message['content']>);
    const h = io({
      client,
      runner: async (file, args) => {
        calls.push([file, args]);
        return { ok: true, code: 0, stderr: '', stdout: args.includes('--failed') ? '● egyptair-jobs@wedged.service loaded failed failed x' : args.includes('--since') ? '' : 'ok' };
      },
      postThread: async () => { throw new Error('slack down'); },
    });
    const r = await det.tick(h.io);
    expect(r.skipped).toBe('restarting');
    expect(calls.some(([, a]) => a.includes('restart') && a.includes('egyptair'))).toBe(true);
  });

  it('first-ever tick (no cursor) seeds it to the current max error id and creates no incident from the pre-existing backlog', async () => {
    resetIncidents();
    db.getDb().prepare(`DELETE FROM settings WHERE key = ?`).run('ops_detector_last_error_id');
    db.queries.logError({ source: 'poller', message: 'pre-existing backlog 1' });
    db.queries.logError({ source: 'poller', message: 'pre-existing backlog 2' });
    db.queries.logError({ source: 'poller', message: 'pre-existing backlog 3' });
    const expectedMax = db.queries.maxErrorLogId();
    await det.tick(io().io);
    expect(db.queries.openIncidents().filter(i => i.source === 'err')).toEqual([]);
    expect(db.queries.getSetting('ops_detector_last_error_id')).toBe(String(expectedMax));
  });

  it('a row logged after the seeding tick is picked up on the next tick', async () => {
    resetIncidents();
    db.queries.logError({ source: 'poller', message: 'logged after seed' });
    await det.tick(io().io);
    const inc = db.queries.openIncidents().find(i => i.source === 'err');
    expect(inc).toBeTruthy();
    expect(inc?.title).toBe('Errors: poller (1 in window)');
  });
});

describe('postBootCheck', () => {
  it('posts back up into fixing threads that have a restart or deploy timestamp', async () => {
    const { row } = db.queries.upsertIncident('health:last_poll', 'health', 'Health check failing: last_poll');
    db.queries.setIncidentSlackTs(row.id, 'ts.h');
    db.queries.markIncidentRestart(row.id, '2026-09-14T00:00:00.000Z');
    db.queries.setIncidentStatus(row.id, 'fixing');
    const h = io();
    await det.postBootCheck(h.io);
    expect(h.threads).toContainEqual(['ts.h', '✅ Back up, health OK.']);
  });

  it('does not post for a fixing incident with neither a restart nor a deploy timestamp', async () => {
    const { row } = db.queries.upsertIncident('health:no_timestamp', 'health', 'Health check failing: no_timestamp');
    db.queries.setIncidentSlackTs(row.id, 'ts.notouch');
    db.queries.setIncidentStatus(row.id, 'fixing');
    const h = io();
    await det.postBootCheck(h.io);
    expect(h.threads.find(([ts]) => ts === 'ts.notouch')).toBeUndefined();
  });

  it('posts the unhealthy warning and moves the incident to needs_human when health is not ok', async () => {
    const { row } = db.queries.upsertIncident('health:last_poll2', 'health', 'Health check failing: last_poll2');
    db.queries.setIncidentSlackTs(row.id, 'ts.bad');
    db.queries.markIncidentDeploy(row.id, '2026-09-14T00:00:00.000Z');
    db.queries.setIncidentStatus(row.id, 'fixing');
    const h = io({ fetchHealth: async () => ({ ok: false, checks: { last_poll: { ok: false, detail: 'stale' } } }) });
    await det.postBootCheck(h.io);
    const posted = h.threads.find(([ts]) => ts === 'ts.bad');
    expect(posted?.[1]).toContain('⚠️ Back up but not healthy');
    expect(db.queries.incidentById(row.id)?.status).toBe('needs_human');
  });
});

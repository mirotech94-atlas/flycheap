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

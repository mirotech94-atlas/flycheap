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

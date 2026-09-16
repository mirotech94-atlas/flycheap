import { describe, it, expect } from 'vitest';
import { probeFailedUnits, probeJobRuns, probeErrors, probeHealth, probeCrashLoop, probeDisk, parseDiskFreeKb, errorFingerprint } from '@/lib/ops/probes';

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

describe('parseDiskFreeKb', () => {
  it('parses the Available column of `df -Pk` output', () => {
    const out = ['Filesystem     1024-blocks     Used Available Capacity Mounted on', '/dev/sda1        41152800 39572404   1580396      97% /'].join('\n');
    expect(parseDiskFreeKb(out)).toBe(1580396);
  });
  it('returns null for unparseable output', () => {
    expect(parseDiskFreeKb('')).toBeNull();
    expect(parseDiskFreeKb('df: /opt/egyptair-tracker: No such file or directory')).toBeNull();
  });
});

describe('probeDisk', () => {
  const GB = 1024 * 1024;
  it('opens only below 1.5 GB free when nothing is open yet', () => {
    expect(probeDisk(1.6 * GB, false)).toEqual([]);
    const f = probeDisk(1.4 * GB, false);
    expect(f).toEqual([{ fingerprint: 'disk:low', source: 'disk', title: 'Disk space low: 1.4 GB free', detail: expect.stringContaining('available on /opt/egyptair-tracker') }]);
  });
  it('once open, stays open until >= 2 GB free (hysteresis)', () => {
    expect(probeDisk(1.8 * GB, true)).toHaveLength(1);
    expect(probeDisk(1.99 * GB, true)).toHaveLength(1);
    expect(probeDisk(2 * GB, true)).toEqual([]);
  });
  it('unparseable df output produces no finding', () => {
    expect(probeDisk(null, false)).toEqual([]);
    expect(probeDisk(null, true)).toEqual([]);
  });
});

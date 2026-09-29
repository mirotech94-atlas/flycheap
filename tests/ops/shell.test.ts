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
    expect(commands.deploy()).toEqual({ file: 'sudo', args: ['/usr/bin/systemd-run', '--unit=egyptair-redeploy', '--collect', '--no-block', '/usr/bin/bash', '/usr/local/sbin/flycheap-deploy'] });
  });
  it('clamps journal lines to 10–200', () => {
    expect(commands.journal('egyptair', 0).args).toContain('10');
    expect(commands.journal('egyptair', 40).args).toEqual(['/usr/bin/journalctl', '-u', 'egyptair', '-n', '40', '--no-pager']);
  });
  it('journal builds the full sudo command spec for the "egyptair" special case', () => {
    expect(commands.journal('egyptair', 40)).toEqual({ file: 'sudo', args: ['/usr/bin/journalctl', '-u', 'egyptair', '-n', '40', '--no-pager'] });
  });
  it('clamps journalSince minutes to 1–120', () => {
    expect(commands.journalSince(0).args).toContain('-1min');
    expect(commands.journalSince(999).args).toContain('-120min');
    expect(commands.journalSince(undefined as unknown as number).args).toContain('-15min');
  });
});

describe('run', () => {
  it('passes the spec to the runner and returns its result', async () => {
    const calls: Array<[string, string[]]> = [];
    const fake: Runner = async (file, args) => { calls.push([file, args]); return { ok: true, code: 0, stdout: 'x', stderr: '' }; };
    const r = await run(commands.listFailed(), fake);
    expect(r.stdout).toBe('x');
    expect(calls).toEqual([['sudo', ['/usr/bin/systemctl', 'list-units', '--failed', '--no-legend', '--plain', 'egyptair*']]]);
  });
});

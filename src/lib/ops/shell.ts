import 'server-only';
import { execFile } from 'node:child_process';

/**
 * The ONLY place privileged commands are built and run. Every spec here has a
 * matching line in deploy/sudoers-egyflights-ops; anything not listed there is
 * refused by sudo regardless of what the model asks for.
 */

export type ShellResult = { ok: boolean; code: number | null; stdout: string; stderr: string };
export type Runner = (file: string, args: string[]) => Promise<ShellResult>;
export type CommandSpec = { file: string; args: string[] };

export const UNIT_RE = /^egyptair-(jobs@[a-z0-9-]+|post-video|backup)(\.service)?$/;

export function normalizeUnit(input: string): string {
  const s = String(input ?? '').trim();
  if (!UNIT_RE.test(s)) throw new Error('invalid unit');
  return s.endsWith('.service') ? s : `${s}.service`;
}

const SYSTEMCTL = '/usr/bin/systemctl';
const JOURNALCTL = '/usr/bin/journalctl';
const MAX_LINES = 200;

export const commands = {
  restartApp: (): CommandSpec => ({ file: 'sudo', args: [SYSTEMCTL, 'restart', 'egyptair'] }),
  resetFailed: (unit: string): CommandSpec => ({ file: 'sudo', args: [SYSTEMCTL, 'reset-failed', normalizeUnit(unit)] }),
  startUnit: (unit: string): CommandSpec => ({ file: 'sudo', args: [SYSTEMCTL, 'start', normalizeUnit(unit)] }),
  listFailed: (): CommandSpec => ({ file: 'sudo', args: [SYSTEMCTL, '--failed', '--no-legend', 'egyptair*'] }),
  journal: (unit: string, lines: number): CommandSpec => {
    const n = Math.min(MAX_LINES, Math.max(10, Math.floor(Number(lines) || 50)));
    // 'egyptair' (main app) or an allowed job unit.
    const u = unit === 'egyptair' ? 'egyptair' : normalizeUnit(unit);
    return { file: 'sudo', args: [JOURNALCTL, '-u', u, '-n', String(n), '--no-pager'] };
  },
  journalSince: (minutes: number): CommandSpec => {
    const m = Math.min(120, Math.max(1, Math.floor(Number(minutes) || 15)));
    return { file: 'sudo', args: [JOURNALCTL, '-u', 'egyptair', '--since', `-${m}min`, '--no-pager', '-o', 'cat'] };
  },
  deploy: (): CommandSpec => ({ file: 'sudo', args: ['/usr/bin/bash', '/opt/egyptair-tracker/deploy/deploy.sh'] }),
};

const OUTPUT_CAP = 64 * 1024;

export const defaultRunner: Runner = (file, args) =>
  new Promise(resolve => {
    execFile(file, args, { timeout: 120_000, maxBuffer: OUTPUT_CAP * 4, env: { PATH: '/usr/bin:/bin' } as unknown as NodeJS.ProcessEnv }, (err: any, stdout: any, stderr: any) => {
      const code = err && typeof (err as NodeJS.ErrnoException & { code?: number | string }).code === 'number'
        ? Number((err as { code?: number }).code) : err ? null : 0;
      resolve({
        ok: !err,
        code,
        stdout: String(stdout ?? '').slice(-OUTPUT_CAP),
        stderr: String(stderr ?? (err ? err.message : '')).slice(-OUTPUT_CAP),
      });
    });
  });

export function run(spec: CommandSpec, runner: Runner = defaultRunner): Promise<ShellResult> {
  return runner(spec.file, spec.args);
}

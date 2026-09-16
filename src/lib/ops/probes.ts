import crypto from 'node:crypto';
import { UNIT_RE } from './shell';

/** Pure parsers: raw inputs → findings. No I/O here so every branch is unit-testable. */

export type FindingSource = 'unit' | 'job' | 'err' | 'health' | 'crashloop' | 'disk';
export type Finding = { fingerprint: string; source: FindingSource; title: string; detail: string };
export type HealthJson = { ok: boolean; checks: Record<string, { ok: boolean; detail?: string; ms?: number }> } | null;

export function probeFailedUnits(systemctlOut: string): Finding[] {
  const out: Finding[] = [];
  for (const raw of systemctlOut.split('\n')) {
    const line = raw.replace(/^[●\s]+/, '').trim();
    if (!line) continue;
    const unit = line.split(/\s+/)[0];
    if (!UNIT_RE.test(unit)) continue;
    const name = unit.replace(/\.service$/, '');
    out.push({
      fingerprint: `unit:${unit.endsWith('.service') ? unit : unit + '.service'}`,
      source: 'unit',
      title: `Job failed: ${name}`,
      detail: line,
    });
  }
  return out;
}

export function probeJobRuns(rows: Array<{ job: string; started_at: string; message: string | null }>): Finding[] {
  const byJob = new Map<string, { started_at: string; message: string | null; n: number }>();
  for (const r of rows) {
    const cur = byJob.get(r.job);
    if (!cur) byJob.set(r.job, { started_at: r.started_at, message: r.message, n: 1 });
    else { cur.n += 1; if (r.started_at > cur.started_at) { cur.started_at = r.started_at; cur.message = r.message; } }
  }
  return Array.from(byJob, ([job, v]) => ({
    fingerprint: `job:${job}`,
    source: 'job' as const,
    title: `Job run failed: ${job}`,
    detail: `${v.n} failed run${v.n > 1 ? 's' : ''}; latest ${v.started_at} UTC — ${v.message ?? '(no message)'}`,
  }));
}

/** Digit runs become '#' so the same error groups across ids/counts/status codes. */
export function normalizeErrorMessage(message: string): string {
  return message.replace(/\d+/g, '#').slice(0, 80);
}

export function errorFingerprint(source: string | null, message: string): string {
  const key = `${source ?? '-'}|${normalizeErrorMessage(message)}`;
  return `err:${source ?? '-'}:${crypto.createHash('sha1').update(key).digest('hex').slice(0, 10)}`;
}

export function probeErrors(rows: Array<{ source: string | null; message: string; occurred_at: string }>): Finding[] {
  const groups = new Map<string, { source: string | null; first: string; n: number; latest: string }>();
  for (const r of rows) {
    const fp = errorFingerprint(r.source, r.message);
    const g = groups.get(fp);
    if (!g) groups.set(fp, { source: r.source, first: r.message, n: 1, latest: r.occurred_at });
    else { g.n += 1; if (r.occurred_at > g.latest) g.latest = r.occurred_at; }
  }
  return Array.from(groups, ([fingerprint, g]) => ({
    fingerprint,
    source: 'err' as const,
    title: `Errors: ${g.source ?? 'unknown'} (${g.n} in window)`,
    detail: `${g.first.slice(0, 300)}${g.first.length > 300 ? '…' : ''} — latest ${g.latest} UTC`,
  }));
}

export function probeHealth(health: HealthJson): Finding[] {
  if (!health) {
    return [{ fingerprint: 'health:unreachable', source: 'health', title: 'Health endpoint unreachable', detail: 'GET /api/health failed' }];
  }
  return Object.entries(health.checks)
    .filter(([, c]) => !c.ok)
    .map(([name, c]) => ({
      fingerprint: `health:${name}`,
      source: 'health' as const,
      title: `Health check failing: ${name}`,
      detail: c.detail ?? '(no detail)',
    }));
}

const KB_PER_GB = 1024 * 1024;
export const DISK_LOW_KB = 1.5 * KB_PER_GB;
export const DISK_CLEAR_KB = 2 * KB_PER_GB;

/** Parses `df -Pk <mount>` output into the KB available on the last (data)
 * row. Returns null if the output can't be parsed (e.g. df failed). */
export function parseDiskFreeKb(dfOutput: string): number | null {
  const lines = dfOutput.trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) return null;
  // Posix `df -P`: Filesystem 1024-blocks Used Available Capacity Mounted-on
  const cols = last.trim().split(/\s+/);
  const avail = Number(cols[3]);
  return Number.isFinite(avail) ? avail : null;
}

/** Hysteresis so a slow climb from 1.4 GB to 1.6 GB doesn't flap the
 * incident open/closed: once open, it only clears at >= 2 GB free; it only
 * opens (from clear) below 1.5 GB free. */
export function probeDisk(availableKb: number | null, alreadyOpen: boolean): Finding[] {
  if (availableKb === null) return [];
  const stillLow = alreadyOpen ? availableKb < DISK_CLEAR_KB : availableKb < DISK_LOW_KB;
  if (!stillLow) return [];
  const gb = availableKb / KB_PER_GB;
  return [{
    fingerprint: 'disk:low',
    source: 'disk',
    title: `Disk space low: ${gb.toFixed(1)} GB free`,
    detail: `${availableKb} KB (${gb.toFixed(2)} GB) available on /opt/egyptair-tracker`,
  }];
}

export function probeCrashLoop(journalCatOut: string, threshold = 3): Finding[] {
  const starts = journalCatOut.split('\n').filter(l => /^Started egyptair\.service/.test(l.trim())).length;
  if (starts < threshold) return [];
  return [{
    fingerprint: 'crashloop',
    source: 'crashloop',
    title: `App restarting repeatedly (${starts} starts in 15 min)`,
    detail: `${starts} starts of egyptair.service in the last 15 minutes`,
  }];
}

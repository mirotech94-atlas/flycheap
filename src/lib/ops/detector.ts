import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { queries, type OpsIncidentRow } from '@/lib/db';
import { commands, run, defaultRunner, type Runner } from './shell';
import { probeFailedUnits, probeJobRuns, probeErrors, probeHealth, probeCrashLoop, errorFingerprint, type Finding, type HealthJson } from './probes';
import { formatCard, formatResolved, formatBackUp, type CardFooter } from './card';
import { diagnose, autoFix, type AgentDeps, type MessagesClient } from './agent';

export type DetectorIO = {
  runner: Runner;
  fetchHealth: () => Promise<HealthJson>;
  postCard: (text: string) => Promise<string | null>;
  postThread: (ts: string, text: string) => Promise<void>;
  client: MessagesClient | null;
  now?: () => Date;
};

const LOCK = 'ops-detector';
const LAST_TICK_KEY = 'ops_detector_last_tick';
const LAST_ERROR_ID_KEY = 'ops_detector_last_error_id';
const ERR_QUIET_MS = 60 * 60 * 1000;
const JOB_LOOKBACK_MIN = 120;

const sqliteNow = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
const parseSqlite = (s: string) => Date.parse(s.replace(' ', 'T') + 'Z');

// Errors: a monotonic error_log.id cursor. errorRowsAfterId excludes the
// detector's own 'ops-detector' log rows, so a probe failure can never
// manufacture an incident about itself, and (being id-ordered, not
// timestamp-ordered) it can't drop a row written in the same wall-clock
// second as another, or lose the tail of a >200-row burst the way a
// timestamp cursor with a fixed LIMIT would.
//
// Jobs: no cursor at all — a bounded lookback (failedJobRunsSince over the
// last JOB_LOOKBACK_MIN minutes). Re-reading an already-incidented failed
// run is harmless: 'job' incidents resolve via latestJobRunOk(job) === true,
// not via absence from this list. The lookback also means a run that only
// fails long after it started is still caught.
async function gather(io: DetectorIO, now: Date, lastErrorId: number | null): Promise<{ findings: Finding[]; maxErrorId: number | null; errorCounts: Map<string, number> }> {
  const out: Finding[] = [];
  let maxErrorId: number | null = null;
  const errorCounts = new Map<string, number>();
  const jobsSince = sqliteNow(new Date(now.getTime() - JOB_LOOKBACK_MIN * 60_000));
  const probes: Array<[string, () => Promise<Finding[]>]> = [
    ['units', async () => probeFailedUnits((await run(commands.listFailed(), io.runner)).stdout)],
    ['jobs', async () => probeJobRuns(queries.failedJobRunsSince(jobsSince))],
    // lastErrorId is null only on the very first tick ever (cursor never
    // set) — the errors probe is skipped that tick (see tick() below, which
    // seeds the cursor to the current max id instead) so a pre-existing
    // backlog of error rows never becomes an incident.
    ...(lastErrorId === null ? [] : [['errors', async () => {
      const rows = queries.errorRowsAfterId(lastErrorId);
      for (const r of rows) {
        if (maxErrorId === null || r.id > maxErrorId) maxErrorId = r.id;
        const fp = errorFingerprint(r.source, r.message);
        errorCounts.set(fp, (errorCounts.get(fp) ?? 0) + 1);
      }
      return probeErrors(rows);
    }] as [string, () => Promise<Finding[]>]]),
    ['health', async () => probeHealth(await io.fetchHealth())],
    ['crashloop', async () => probeCrashLoop((await run(commands.journalSince(15), io.runner)).stdout)],
  ];
  for (const [name, p] of probes) {
    try { out.push(...(await p())); }
    catch (e) { queries.logError({ source: 'ops-detector', message: `probe ${name} failed: ${(e as Error).message}` }); }
  }
  return { findings: out, maxErrorId, errorCounts };
}

async function evidenceFor(f: Finding, io: DetectorIO): Promise<string> {
  try {
    if (f.source === 'unit') {
      const unit = f.fingerprint.slice('unit:'.length);
      return (await run(commands.journal(unit, 30), io.runner)).stdout || f.detail;
    }
    if (f.source === 'crashloop' || f.source === 'health') {
      return (await run(commands.journal('egyptair', 40), io.runner)).stdout || f.detail;
    }
  } catch { /* fall through */ }
  return f.detail;
}

function agentDeps(io: DetectorIO): AgentDeps {
  return { runner: io.runner, client: io.client, fetchHealth: io.fetchHealth, now: io.now };
}

async function openCard(inc: OpsIncidentRow, f: Finding, io: DetectorIO): Promise<{ posted: boolean; restarted: boolean }> {
  const evidence = await evidenceFor(f, io);
  const d = await diagnose(inc, evidence, agentDeps(io));
  let footer: CardFooter = { kind: 'none' };
  if (d.safeAction) footer = { kind: 'fixing', text: `${d.safeAction.tool} ${JSON.stringify(d.safeAction.input)}` };
  const pending = queries.incidentById(inc.id)?.last_action;
  if (pending?.startsWith('PROPOSAL:')) footer = { kind: 'needs_you', text: 'see the proposal below and reply *go* to approve' };
  const ts = await io.postCard(formatCard({ title: inc.title, firstSeen: inc.first_seen, occurrences: inc.occurrences, evidence, diagnosis: d.text, footer }));
  if (!ts) return { posted: false, restarted: false };
  queries.setIncidentSlackTs(inc.id, ts);
  if (!d.safeAction) return { posted: true, restarted: false };
  const fix = await autoFix(queries.incidentById(inc.id) ?? inc, d.safeAction, agentDeps(io));
  const restarted = fix.restarted;
  try { await io.postThread(ts, fix.text); }
  catch (e) { queries.logError({ source: 'ops-detector', message: `postThread failed for incident ${inc.id}: ${(e as Error).message}` }); }
  return { posted: true, restarted };
}

export async function tick(io: DetectorIO): Promise<{ created: number; resolved: number; posted: number; skipped: string | null }> {
  const now = io.now?.() ?? new Date();
  const holder = `tick-${now.getTime()}`;
  if (!queries.tryAcquireJobLock(LOCK, holder, 600)) return { created: 0, resolved: 0, posted: 0, skipped: 'locked' };
  let created = 0, resolved = 0, posted = 0;
  try {
    const rawLastErrorId = queries.getSetting(LAST_ERROR_ID_KEY);
    let lastErrorId: number | null;
    if (rawLastErrorId === undefined) {
      // Cursor never set (first tick ever, distinct from "0"): seed it to
      // the current max error_log id and skip the errors probe this tick,
      // so a pre-existing backlog never all becomes one incident at once.
      const seed = queries.maxErrorLogId();
      queries.setSetting(LAST_ERROR_ID_KEY, String(seed));
      lastErrorId = null;
    } else {
      lastErrorId = Number(rawLastErrorId);
    }
    const { findings, maxErrorId, errorCounts } = await gather(io, now, lastErrorId);
    const seen = new Set<string>();
    for (const f of findings) {
      seen.add(f.fingerprint);
      let { row, created: isNew } = queries.upsertIncident(f.fingerprint, f.source, f.title);
      // probeErrors groups every matching error_log row into one Finding per
      // tick; upsertIncident above only counts that as a single occurrence.
      // Bump occurrences for the rest of the group so none of the underlying
      // rows are silently uncounted, and re-fetch so the card (if any) shows
      // the up-to-date count.
      if (f.source === 'err') {
        const extra = (errorCounts.get(f.fingerprint) ?? 1) - 1;
        for (let i = 0; i < extra; i++) queries.upsertIncident(f.fingerprint, f.source, f.title);
        if (extra > 0) row = queries.incidentById(row.id) ?? row;
      }
      if (isNew) {
        created += 1;
        try {
          const r = await openCard(row, f, io);
          if (r.posted) posted += 1;
          if (r.restarted) return { created, resolved, posted, skipped: 'restarting' };
        } catch (e) {
          queries.logError({ source: 'ops-detector', message: `card for ${f.fingerprint} failed: ${(e as Error).message}` });
        }
      }
    }
    // Resolve cleared incidents first (even ones that never got a card
    // posted — nothing to retry for those), then retry cards that never
    // posted (Slack was down) for whatever is still open.
    for (const inc of queries.openIncidents()) {
      const stillPresent = seen.has(inc.fingerprint);
      let cleared = false;
      if (inc.source === 'err') cleared = !stillPresent && now.getTime() - parseSqlite(inc.last_seen) > ERR_QUIET_MS;
      else if (inc.source === 'job') cleared = queries.latestJobRunOk(inc.fingerprint.slice('job:'.length)) === true;
      else cleared = !stillPresent;

      if (cleared) {
        if (inc.slack_ts) {
          try { await io.postThread(inc.slack_ts, formatResolved(inc.title)); } catch { /* best-effort */ }
        }
        queries.resolveIncident(inc.id);
        resolved += 1;
        continue;
      }
      if (!inc.slack_ts) {
        const f = findings.find(x => x.fingerprint === inc.fingerprint) ?? { fingerprint: inc.fingerprint, source: inc.source as Finding['source'], title: inc.title, detail: '' };
        try { const r = await openCard(inc, f, io); if (r.posted) posted += 1; if (r.restarted) return { created, resolved, posted, skipped: 'restarting' }; }
        catch (e) { queries.logError({ source: 'ops-detector', message: `retry card ${inc.fingerprint}: ${(e as Error).message}` }); }
      }
    }
    if (maxErrorId !== null) queries.setSetting(LAST_ERROR_ID_KEY, String(maxErrorId));
    // Informational only — no longer used to drive any query.
    queries.setSetting(LAST_TICK_KEY, sqliteNow(now));
  } catch (e) {
    queries.logError({ source: 'ops-detector', message: `tick failed: ${(e as Error).message}`, stack: (e as Error).stack });
  } finally {
    queries.releaseJobLock(LOCK, holder);
  }
  return { created, resolved, posted, skipped: null };
}

export async function postBootCheck(io: DetectorIO): Promise<void> {
  try {
    const h = await io.fetchHealth();
    const fixing = queries.openIncidents().filter(i => i.status === 'fixing' && i.slack_ts && (i.last_restart_at || i.last_deploy_at));
    if (!fixing.length) return;
    if (h?.ok) {
      for (const inc of fixing) await io.postThread(inc.slack_ts!, formatBackUp());
    } else {
      const bad = h ? Object.entries(h.checks).filter(([, c]) => !c.ok).map(([k, c]) => `${k}: ${c.detail ?? 'failing'}`).join('; ') : 'health endpoint unreachable';
      for (const inc of fixing) {
        await io.postThread(inc.slack_ts!, `⚠️ Back up but not healthy — ${bad}\n*Needs you:* tell me how you want to proceed, or reply *go* if you want a redeploy proposal.`);
        queries.setIncidentStatus(inc.id, 'needs_human');
      }
    }
  } catch (e) {
    queries.logError({ source: 'ops-detector', message: `postBootCheck: ${(e as Error).message}` });
  }
}

export function productionIO(): DetectorIO {
  return {
    runner: defaultRunner,
    fetchHealth: async () => {
      try {
        const r = await fetch('http://127.0.0.1:3000/api/health', { headers: { Host: 'flycheap.18dn.com' }, signal: AbortSignal.timeout(8000) });
        return r.ok || r.status === 503 ? (await r.json()) as HealthJson : null;
      } catch { return null; }
    },
    postCard: async text => {
      const { postFounderSlack } = await import('@/lib/notifier');
      const r = await postFounderSlack('admin', text);
      return r.ok && r.id ? r.id : null;
    },
    postThread: async (ts, text) => {
      const { postToSlackThread, founderChannelId } = await import('@/lib/notifier');
      await postToSlackThread(founderChannelId('admin'), ts, text);
    },
    client: process.env.ANTHROPIC_API_KEY
      ? (new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) as unknown as MessagesClient)
      : null,
  };
}

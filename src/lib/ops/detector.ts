import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { queries, type OpsIncidentRow } from '@/lib/db';
import { commands, run, defaultRunner, type Runner } from './shell';
import { probeFailedUnits, probeJobRuns, probeErrors, probeHealth, probeCrashLoop, type Finding, type HealthJson } from './probes';
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
const ERR_QUIET_MS = 60 * 60 * 1000;

const sqliteNow = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
const parseSqlite = (s: string) => Date.parse(s.replace(' ', 'T') + 'Z');

// errorRowsSince/failedJobRunsSince compare against second-precision sqlite
// timestamps with a strict '>'. If the stored cursor were simply "now" (the
// detector process's wall-clock time), a row written in the very same
// wall-clock second as that cursor would be silently and permanently
// dropped — routine when ticks run back-to-back (e.g. in tests, or two
// scheduled ticks close together). Instead the cursor advances to the
// newest occurred_at/started_at actually read this tick, so a row is never
// missed and never reprocessed on a later tick.
async function gather(io: DetectorIO, since: string): Promise<{ findings: Finding[]; newCursor: string | null }> {
  const out: Finding[] = [];
  let newCursor: string | null = null;
  const bump = (ts: string) => { if (!newCursor || ts > newCursor) newCursor = ts; };
  const probes: Array<[string, () => Promise<Finding[]>]> = [
    ['units', async () => probeFailedUnits((await run(commands.listFailed(), io.runner)).stdout)],
    ['jobs', async () => {
      const rows = queries.failedJobRunsSince(since);
      for (const r of rows) bump(r.started_at);
      return probeJobRuns(rows);
    }],
    ['errors', async () => {
      const rows = queries.errorRowsSince(since);
      for (const r of rows) bump(r.occurred_at);
      return probeErrors(rows);
    }],
    ['health', async () => probeHealth(await io.fetchHealth())],
    ['crashloop', async () => probeCrashLoop((await run(commands.journalSince(15), io.runner)).stdout)],
  ];
  for (const [name, p] of probes) {
    try { out.push(...(await p())); }
    catch (e) { queries.logError({ source: 'ops-detector', message: `probe ${name} failed: ${(e as Error).message}` }); }
  }
  return { findings: out, newCursor };
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
  await io.postThread(ts, fix.text);
  return { posted: true, restarted: fix.restarted };
}

export async function tick(io: DetectorIO): Promise<{ created: number; resolved: number; posted: number; skipped: string | null }> {
  const now = io.now?.() ?? new Date();
  const holder = `tick-${now.getTime()}`;
  if (!queries.tryAcquireJobLock(LOCK, holder, 600)) return { created: 0, resolved: 0, posted: 0, skipped: 'locked' };
  let created = 0, resolved = 0, posted = 0;
  try {
    const storedSince = queries.getSetting(LAST_TICK_KEY) ?? sqliteNow(new Date(now.getTime() - 24 * 3600 * 1000));
    const { findings, newCursor } = await gather(io, storedSince);
    const seen = new Set<string>();
    for (const f of findings) {
      seen.add(f.fingerprint);
      const { row, created: isNew } = queries.upsertIncident(f.fingerprint, f.source, f.title);
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
    // Retry cards that never posted (Slack was down), and resolve cleared incidents.
    for (const inc of queries.openIncidents()) {
      if (!inc.slack_ts) {
        const f = findings.find(x => x.fingerprint === inc.fingerprint) ?? { fingerprint: inc.fingerprint, source: inc.source as Finding['source'], title: inc.title, detail: '' };
        try { const r = await openCard(inc, f, io); if (r.posted) posted += 1; if (r.restarted) return { created, resolved, posted, skipped: 'restarting' }; }
        catch (e) { queries.logError({ source: 'ops-detector', message: `retry card ${inc.fingerprint}: ${(e as Error).message}` }); }
        continue;
      }
      const stillPresent = seen.has(inc.fingerprint);
      let cleared = false;
      if (inc.source === 'err') cleared = !stillPresent && now.getTime() - parseSqlite(inc.last_seen) > ERR_QUIET_MS;
      else if (inc.source === 'job') cleared = queries.latestJobRunOk(inc.fingerprint.slice('job:'.length)) === true;
      else cleared = !stillPresent;
      if (cleared) {
        try { await io.postThread(inc.slack_ts, formatResolved(inc.title)); } catch { /* best-effort */ }
        queries.resolveIncident(inc.id);
        resolved += 1;
      }
    }
    queries.setSetting(LAST_TICK_KEY, newCursor && newCursor > storedSince ? newCursor : storedSince);
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
    const fixing = queries.openIncidents().filter(i => i.status === 'fixing' && i.slack_ts);
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

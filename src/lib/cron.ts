import 'server-only';
import cron from 'node-cron';
import { queries } from './db';
import { pollAll } from './poller';
import { sendDigest, sendAnomalyDigest } from './digest';
import { refreshBestDeals } from './bestDeals';

let task: cron.ScheduledTask | null = null;
let digestTask: cron.ScheduledTask | null = null;
let reportQueueTask: cron.ScheduledTask | null = null;
let reportSendTask: cron.ScheduledTask | null = null;
let verdictScoreTask: ReturnType<typeof cron.schedule> | null = null;
let chainTask: ReturnType<typeof cron.schedule> | null = null;
let bestDealsTask: cron.ScheduledTask | null = null;
let weeklyTask: cron.ScheduledTask | null = null;
let compactTask: cron.ScheduledTask | null = null;
let opsTask: cron.ScheduledTask | null = null;
let opsBootTimer: NodeJS.Timeout | null = null;

function intervalToCron(minutes: number): string {
  const m = Math.max(5, Math.floor(minutes));
  if (m >= 60) {
    const hours = Math.floor(m / 60);
    return `0 */${hours} * * *`;
  }
  return `*/${m} * * * *`;
}

export function startCron() {
  const minutesStr = queries.getSetting('poll_interval_minutes') ?? process.env.POLL_INTERVAL_MINUTES ?? '30';
  const minutes = parseInt(minutesStr, 10) || 30;
  const expr = intervalToCron(minutes);

  if (task) task.stop();
  task = cron.schedule(expr, async () => {
    const t = new Date().toISOString();
    try {
      const results = await pollAll();
      console.log(`[cron ${t}] polled ${results.length} searches`, results);
    } catch (e) {
      console.error(`[cron ${t}] poll failed`, e);
      queries.logError({ source: 'cron:poll', message: (e as Error).message, stack: (e as Error).stack });
    }
  });

  console.log(`[cron] started — every ${minutes} min (expr: ${expr})`);

  // Daily digest at 9am ET (America/New_York), every day.
  if (digestTask) digestTask.stop();
  digestTask = cron.schedule(
    '0 9 * * *',
    async () => {
      const t = new Date().toISOString();
      try {
        const r = await sendDigest();
        console.log(`[digest ${t}] ${r.ok ? `sent to ${r.sentTo} (id=${r.id})` : `FAILED: ${r.error}`}`);
      } catch (e) {
        console.error(`[digest ${t}] threw`, e);
        queries.logError({ source: 'cron:digest', message: (e as Error).message, stack: (e as Error).stack });
      }
    },
    { timezone: 'America/New_York' }
  );
  console.log('[cron] digest scheduled — 9:00 AM America/New_York');

  // Verdict scoring: score yesterday's buy/wait calls whose horizon has now
  // elapsed. Runs daily, off-peak, and is idempotent — a call already scored is
  // never re-scored, so a missed run simply catches up on the next one.
  if (verdictScoreTask) verdictScoreTask.stop();
  verdictScoreTask = cron.schedule(
    '20 4 * * *',
    async () => {
      const t = new Date().toISOString();
      try {
        const { scoreDueVerdicts } = await import('./verdictScoring');
        const seven = scoreDueVerdicts(7);
        const fourteen = scoreDueVerdicts(14);
        console.log(
          `[verdict-score ${t}] 7d: ${seven.scored} scored / ${seven.skipped} without evidence · ` +
          `14d: ${fourteen.scored} scored / ${fourteen.skipped} without evidence`,
        );
      } catch (e) {
        console.error(`[verdict-score ${t}] threw`, e);
        queries.logError({ source: 'cron:verdict-score', message: (e as Error).message, stack: (e as Error).stack });
      }
    },
    { timezone: 'America/New_York' }
  );
  console.log('[cron] verdict scoring scheduled — 4:20 AM America/New_York');

  // Trip chain: send whatever is due. Every 10 minutes, because the
  // confirmation is scheduled 20-40 minutes after a Book click and a coarser
  // tick would stretch that window past the point where the question still
  // feels connected to the thing they just did.
  if (chainTask) chainTask.stop();
  chainTask = cron.schedule('*/10 * * * *', async () => {
    const t = new Date().toISOString();
    try {
      const { runChainSends } = await import('./tripChainEmail');
      const { expireStaleTrips } = await import('./tripChain');
      const r = await runChainSends();
      const expired = expireStaleTrips(7);
      if (r.due > 0 || expired > 0) {
        console.log(
          `[chain ${t}] ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed of ${r.due} due` +
          (expired ? ` · ${expired} unconfirmed trips expired` : ''),
        );
      }
    } catch (e) {
      console.error(`[chain ${t}] threw`, e);
      queries.logError({ source: 'cron:chain', message: (e as Error).message, stack: (e as Error).stack });
    }
  });
  console.log('[cron] trip chain scheduled — every 10 minutes');

  // Monthly savings reports: BUILD on the first of the month, SEND only what a
  // human has approved. Two separate ticks on purpose — the queue fills once,
  // and the send loop runs often enough that an approval goes out in the same
  // sitting rather than the next morning.
  if (reportQueueTask) reportQueueTask.stop();
  reportQueueTask = cron.schedule('0 7 1 * *', async () => {
    const t = new Date().toISOString();
    try {
      const { queueAllMonthlyReports } = await import('./reportQueue');
      const r = queueAllMonthlyReports();
      console.log(`[reports ${t}] queued ${r.queued} report(s) across ${r.orgs} org(s) for review`);
    } catch (e) {
      console.error(`[reports ${t}] queue threw`, e);
      queries.logError({ source: 'cron:reports-queue', message: (e as Error).message, stack: (e as Error).stack });
    }
  }, { timezone: 'America/New_York' });

  if (reportSendTask) reportSendTask.stop();
  reportSendTask = cron.schedule('*/15 * * * *', async () => {
    const t = new Date().toISOString();
    try {
      const { sendApprovedReports } = await import('./reportQueue');
      const r = await sendApprovedReports();
      if (r.due > 0) console.log(`[reports ${t}] ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed of ${r.due} approved`);
    } catch (e) {
      console.error(`[reports ${t}] send threw`, e);
      queries.logError({ source: 'cron:reports-send', message: (e as Error).message, stack: (e as Error).stack });
    }
  });
  console.log('[cron] monthly reports scheduled — build 1st 07:00 ET, send every 15 minutes once approved');

  // Best-deals refresh: every 12 hours. Keep this off the boot path so a tiny
  // VPS can always start HTTP/SSH cleanly after deploys or reboots.
  if (bestDealsTask) bestDealsTask.stop();
  bestDealsTask = cron.schedule('0 */12 * * *', async () => {
    const t = new Date().toISOString();
    try {
      const results = await refreshBestDeals({ monthsAhead: 8 });
      const total = results.reduce((s, r) => s + r.count, 0);
      const summary = results.map(r => `${r.destination}=${r.count}`).join(' ');
      console.log(`[best-deals ${t}] refreshed — ${total} pairings across ${results.length} dests | ${summary}`);
    } catch (e) {
      console.error(`[best-deals ${t}] failed`, e);
      queries.logError({ source: 'cron:best-deals', message: (e as Error).message, stack: (e as Error).stack });
    }
  });
  console.log('[cron] best-deals scheduled — every 12 hours');

  // Weekly anomaly digest — Sundays at 8pm America/New_York.
  if (weeklyTask) weeklyTask.stop();
  weeklyTask = cron.schedule(
    '0 20 * * 0',
    async () => {
      const t = new Date().toISOString();
      try {
        const r = await sendAnomalyDigest();
        console.log(`[weekly ${t}] ${r.ok ? `sent to ${r.sentTo} (id=${r.id})` : `FAILED: ${r.error}`}`);
      } catch (e) {
        console.error(`[weekly ${t}] threw`, e);
        queries.logError({ source: 'cron:weekly', message: (e as Error).message, stack: (e as Error).stack });
      }
    },
    { timezone: 'America/New_York' }
  );
  console.log('[cron] weekly anomaly digest scheduled — Sundays 8pm America/New_York');

  // Daily DB compaction — 3:30am America/New_York. Keeps last 30 days of
  // detailed poll snapshots; older rows collapse to a single daily MIN.
  if (compactTask) compactTask.stop();
  compactTask = cron.schedule(
    '30 3 * * *',
    async () => {
      const t = new Date().toISOString();
      try {
        const stats = queries.compactSnapshots(30);
        console.log(`[compact ${t}] deleted=${stats.deleted} kept=${stats.kept} reclaimedKb=${stats.vacuumedKb}`);
      } catch (e) {
        console.error(`[compact ${t}] failed`, e);
        queries.logError({ source: 'cron:compact', message: (e as Error).message, stack: (e as Error).stack });
      }
    },
    { timezone: 'America/New_York' }
  );
  console.log('[cron] DB compaction scheduled — 3:30 AM America/New_York');

  // Ops detector — every 5 minutes. Off switch: setting ops_agent_enabled=false.
  // Dynamic import keeps the Anthropic SDK out of the process's boot path.
  if (opsTask) opsTask.stop();
  opsTask = cron.schedule('*/5 * * * *', async () => {
    if ((queries.getSetting('ops_agent_enabled') ?? 'true') === 'false') return;
    try {
      const { tick, productionIO } = await import('./ops/detector');
      const r = await tick(productionIO());
      if (r.created || r.resolved || r.posted || r.skipped) console.log(`[ops] tick`, r);
    } catch (e) {
      console.error('[ops] tick threw', e);
    }
  });
  console.log('[cron] ops detector scheduled — every 5 min');

  // After a (re)start: confirm health in the threads of incidents we were fixing.
  if (opsBootTimer) clearTimeout(opsBootTimer);
  opsBootTimer = setTimeout(async () => {
    if ((queries.getSetting('ops_agent_enabled') ?? 'true') === 'false') return;
    try {
      const { productionIO, postBootCheck } = await import('./ops/detector');
      await postBootCheck(productionIO());
    } catch (e) {
      console.error('[ops] post-boot check threw', e);
    }
  }, 60_000);
  opsBootTimer.unref();
}

export function restartCron() {
  startCron();
}

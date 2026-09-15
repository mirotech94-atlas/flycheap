#!/usr/bin/env node
/**
 * Standalone job runner — invokable from systemd timers so cron can move out
 * of the Next.js process. Each subcommand runs once and exits with code 0
 * (success) or 1 (failure logged).
 *
 * Usage:
 *   node --experimental-strip-types scripts/run-job.mjs poll
 *   # or, with tsx:
 *   npx tsx scripts/run-job.mjs poll
 *
 * Subcommands: poll | digest | weekly | monthly | six-month | annual | best-deals | bg-poll | route-intel | compact | commissions
 *              | agent-curator | agent-insights | agent-revenue | agent-social-poster | agent-digest | agent-storyteller | agent-social-drain
 *
 * In-process node-cron in src/lib/cron.ts continues to fire unless you set
 * CRON_ENABLED=false on the Next.js service. Use one OR the other, not both.
 *
 * The .mjs extension keeps this file out of Next.js's tsc pass; dynamic
 * imports + tsx at runtime do the heavy lifting.
 */
// Intercept `server-only` imports so the standalone runner can pull in
// Next-flagged server modules (db.ts, poller.ts, …). Next's bundler ignores
// this shim at build time and uses its own stub for the HTTP server.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __require = createRequire(import.meta.url);
const Module = __require('node:module');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shimPath = path.join(__dirname, 'server-only-shim', 'index.js');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return shimPath;
  return origResolve.call(this, request, ...rest);
};

const job = process.argv[2];
const t = new Date().toISOString();

// Acquire a job lock so this systemd timer can't double-fire with the
// in-process node-cron during deploy windows. Lock is auto-released on
// process exit (or after 1h staleness).
async function withJobLock(name, fn) {
  const { queries } = await import('../src/lib/db.ts');
  const holder = `systemd:${process.pid}:${t}`;
  if (!queries.tryAcquireJobLock(name, holder, 3600)) {
    console.log(`[${name} ${t}] another holder has the lock — skipping`);
    return;
  }
  // Durable history → admin dashboard reads this for the job runner health panel.
  const runId = queries.insertJobRun(name);
  const startMs = Date.now();
  let ok = true;
  let msg = null;
  try {
    msg = await fn();
  } catch (e) {
    ok = false;
    msg = e && e.message ? e.message : String(e);
    queries.finishJobRun(runId, false, Date.now() - startMs, msg);
    queries.releaseJobLock(name, holder);
    throw e;
  }
  queries.finishJobRun(runId, ok, Date.now() - startMs, typeof msg === 'string' ? msg : null);
  queries.releaseJobLock(name, holder);
}

async function main() {
  switch (job) {
    case 'poll': {
      await withJobLock('poll', async () => {
        const { pollAll } = await import('../src/lib/poller.ts');
        const r = await pollAll();
        const okCount = r.filter(x => x.ok).length;
        const alertCount = r.filter(x => x.alerted).length;
        console.log(`[poll ${t}] ${r.length} searches polled`, r);
        return `${okCount}/${r.length} ok · ${alertCount} alert${alertCount === 1 ? '' : 's'} fired`;
      });
      break;
    }
    case 'digest': {
      await withJobLock('digest', async () => {
        const { sendDigest } = await import('../src/lib/digest.ts');
        const r = await sendDigest();
        console.log(`[digest ${t}] ${r.ok ? `sent to ${r.sentTo} (id=${r.id})` : `FAILED: ${r.error}`}`);
        if (!r.ok) process.exit(1);
      });
      break;
    }
    case 'weekly': {
      await withJobLock('weekly', async () => {
        const { sendAnomalyDigest } = await import('../src/lib/digest.ts');
        const r = await sendAnomalyDigest();
        console.log(`[weekly ${t}] ${r.ok ? `sent to ${r.sentTo} (id=${r.id})` : `FAILED: ${r.error}`}`);
        if (!r.ok) process.exit(1);
      });
      break;
    }
    case 'best-deals': {
      await withJobLock('best-deals', async () => {
        // Refresh the cache for every destination the user is actively tracking.
        // Each refresh deletes+rebuilds only that destination's rows, so we
        // end up with a multi-destination cache.
        const { refreshBestDeals } = await import('../src/lib/bestDeals.ts');
        const results = await refreshBestDeals({ monthsAhead: 8 });
        const total = results.reduce((s, r) => s + r.count, 0);
        const errors = results.filter(r => r.error).map(r => `${r.destination}:${r.error}`);
        const summary = results.map(r => `${r.destination}=${r.count}`).join(' ');
        console.log(`[best-deals ${t}] ${total} total pairings across ${results.length} dests | ${summary}`
          + (errors.length ? ` | errors: ${errors.join('; ')}` : ''));
      });
      break;
    }
    case 'bg-poll': {
      await withJobLock('bg-poll', async () => {
        // Background polling fleet: refreshes ~25 popular world destinations
        // so the Live Feed + Best Fares Worldwide stay diverse even when the
        // user only tracks a couple of routes.
        const { refreshBackgroundDestinations } = await import('../src/lib/bestDeals.ts');
        const results = await refreshBackgroundDestinations({ monthsAhead: 8 });
        const total = results.reduce((s, r) => s + r.count, 0);
        const errors = results.filter(r => r.error).map(r => `${r.destination}:${r.error}`);
        const summary = results.map(r => `${r.destination}=${r.count}`).join(' ');
        console.log(`[bg-poll ${t}] ${total} total pairings across ${results.length} routes | ${summary}`
          + (errors.length ? ` | errors: ${errors.join('; ')}` : ''));
      });
      break;
    }
    case 'monthly':
    case 'six-month':
    case 'annual': {
      await withJobLock(job, async () => {
        const { sendRetrospectiveDigest } = await import('../src/lib/digest.ts');
        const r = await sendRetrospectiveDigest(job);
        if (r.ok) {
          console.log(`[${job} ${t}] sent to ${r.sentTo} (id ${r.id})`);
        } else {
          console.error(`[${job} ${t}] failed: ${r.error}`);
          process.exit(1);
        }
      });
      break;
    }
    case 'route-intel': {
      await withJobLock('route-intel', async () => {
        // Per-user Route Intelligence: deterministic stats + optional LLM prose.
        // Runs nightly. Skips users with zero polls so we never spend tokens
        // generating prose for an empty pattern.
        const { runRouteIntelForAllUsers } = await import('../src/lib/routeIntel.ts');
        const r = await runRouteIntelForAllUsers();
        console.log(`[route-intel ${t}] users=${r.users} withProse=${r.withProse} errors=${r.errors}`);
      });
      break;
    }
    case 'compact': {
      await withJobLock('compact', async () => {
        const { queries } = await import('../src/lib/db.ts');
        const stats = queries.compactSnapshots(30);
        const rl = queries.rateLimitPrune(86400);
        console.log(`[compact ${t}] deleted=${stats.deleted} kept=${stats.kept} reclaimedKb=${stats.vacuumedKb} rate_limits_pruned=${rl.changes}`);
      });
      break;
    }
    case 'commissions': {
      await withJobLock('commissions', async () => {
        const { pullCommissions } = await import('../src/lib/travelpayoutsStats.ts');
        const r = await pullCommissions();
        const bal = r.balanceUsd === null ? 'unreachable' : `$${r.balanceUsd}`;
        console.log(`[commissions ${t}] balanceUsd=${bal} ingested=${r.ingested} skipped=${r.skipped}${r.error ? ` error=${r.error}` : ''}`);
        // Soft-fail — the affiliate links earn commissions independently of this
        // stats pull. A bad endpoint or empty response shouldn't trip systemd's
        // failure handling. Real bookings still land via partner postbacks
        // through /api/billing/webhook → commission_events.
      });
      break;
    }
    case 'agent-curator': {
      await withJobLock('agent-curator', async () => {
        const { runCurator } = await import('../src/agents/deal-curator/index.ts');
        const r = await runCurator();
        // Full output to stdout — this is the primary inspection surface.
        console.log(`[agent-curator ${t}] run=${r.runId} model=${r.model} dryRun=${r.dryRun} `
          + `candidates=${r.candidatesConsidered} picks=${r.picks.length}`);
        for (const p of r.picks) {
          console.log(
            `\n  [${p.verified ? 'VERIFIED' : 'UNVERIFIED'}] score=${p.score} `
            + `${p.origin}→${p.destination} $${Math.round(p.per_adult_usd)}/adult `
            + `(${p.outbound_date} → ${p.return_date}, ${p.trip_length_days}d)`);
          console.log(`    ${p.headline}`);
          console.log(`    ${p.blurb}`);
          if (p.verify_note) console.log(`    verify: ${p.verify_note}`);
        }
        return `${r.picks.length} picks (${r.picks.filter(p => p.verified).length} verified) · dryRun=${r.dryRun}`;
      });
      break;
    }
    case 'agent-insights': {
      await withJobLock('agent-insights', async () => {
        const { runInsights } = await import('../src/agents/insights/index.ts');
        const r = await runInsights();
        console.log(`[agent-insights ${t}] run=${r.runId} model=${r.model} dryRun=${r.dryRun} `
          + `emailed=${r.emailed} to=${r.emailTo ?? '(none)'}`);
        console.log(`\n----- OPS BRIEF -----\n${r.brief}\n---------------------`);
        return `brief generated · emailed=${r.emailed}`;
      });
      break;
    }
    case 'agent-revenue': {
      await withJobLock('agent-revenue', async () => {
        const { runRevenue } = await import('../src/agents/revenue/index.ts');
        const r = await runRevenue();
        console.log(`[agent-revenue ${t}] run=${r.runId} model=${r.model} dryRun=${r.dryRun} `
          + `triggers=${r.triggers.join('|') || 'none'} emailed=${r.emailed} to=${r.emailTo ?? '(none)'} `
          + `guard=${r.adviceGuardTripped ? 'TRIPPED' : 'ok'}`);
        console.log(`\n----- REVENUE BRIEF -----\n${r.brief}\n-------------------------`);
        return `triggers=${r.triggers.join('|') || 'none'} · emailed=${r.emailed}`;
      });
      break;
    }
    case 'agent-social-poster': {
      await withJobLock('agent-social-poster', async () => {
        const { runSocialPoster } = await import('../src/agents/social-poster/index.ts');
        const r = await runSocialPoster();
        console.log(`[agent-social-poster ${t}] run=${r.runId} model=${r.model} dryRun=${r.dryRun} queued=${r.queued}`);
        for (const p of r.posts) {
          console.log(`\n  [${p.channel.toUpperCase()}] pick=${p.pickId}${p.flags.length ? ` voiceFlags=${p.flags.join(',')}` : ''}`);
          console.log(p.body.split('\n').map(l => `    ${l}`).join('\n'));
        }
        return `${r.queued} posts queued · status=queued · dryRun=${r.dryRun}`;
      });
      break;
    }
    case 'agent-digest': {
      await withJobLock('agent-digest', async () => {
        const { runEmailDigest } = await import('../src/agents/email-digest/index.ts');
        const r = await runEmailDigest();
        console.log(`[agent-digest ${t}] run=${r.runId} model=${r.model} dryRun=${r.dryRun}`);
        for (const x of r.results) {
          console.log(`  user=${x.userId} to=${x.to} redirected=${x.redirected} deals=${x.deals} sent=${x.sent} — ${x.note}`);
        }
        return `${r.results.filter(x => x.sent).length}/${r.results.length} sent · dryRun=${r.dryRun}`;
      });
      break;
    }
    case 'agent-storyteller': {
      await withJobLock('agent-storyteller', async () => {
        const { runRouteStoryteller } = await import('../src/agents/route-storyteller/index.ts');
        const limit = Number(process.argv[3]) || 10;
        const r = await runRouteStoryteller({ limit });
        console.log(`[agent-storyteller ${t}] run=${r.runId} model=${r.model} routes=${r.results.length}`);
        for (const x of r.results) console.log(`  ${x.origin}→${x.destination}: ${x.saved ? 'SAVED' : 'skip'} — ${x.note}`);
        return `${r.results.filter(x => x.saved).length}/${r.results.length} saved`;
      });
      break;
    }
    case 'agent-social-drain': {
      await withJobLock('agent-social-drain', async () => {
        const { runSocialDrain } = await import('../src/agents/social-poster/drain.ts');
        const r = await runSocialDrain();
        console.log(`[agent-social-drain ${t}] run=${r.runId} dryRun=${r.dryRun} scanned=${r.results.length}`);
        for (const x of r.results) console.log(`  #${x.id} ${x.channel}: ${x.posted ? 'POSTED' : 'held'} — ${x.note}`);
        return `${r.results.filter(x => x.posted).length} posted · dryRun=${r.dryRun}`;
      });
      break;
    }
    default:
      console.error(`Unknown job: ${job}\nKnown: poll | digest | weekly | monthly | six-month | annual | best-deals | bg-poll | route-intel | compact | commissions | agent-curator | agent-insights | agent-revenue | agent-social-poster | agent-digest | agent-storyteller | agent-social-drain`);
      process.exit(2);
  }
}

main().catch(e => {
  console.error(`[run-job ${job}] uncaught`, e);
  process.exit(1);
});

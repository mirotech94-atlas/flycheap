import 'server-only';
import { z } from 'zod';
import { queries } from '@/lib/db';
import { MODELS, completeJSON, hasApiKey, isDryRun, pingModel } from '../shared/client';
import { startRun, finishRun } from '../shared/storage';
import { BRAND_VOICE } from '../shared/voice';
import { sendDigestEmail, type DigestDealCard } from '@/lib/email';
import { fmtDate } from '@/lib/utils';

// Email digest composer (phase 2). Per-user: match recent verified picks to the
// user's tracked routes (or their origin airports), ask the model to pick the
// 3-6 most worth their attention and write subject/intro/blurbs, then send.
//
// Gating: in DRY_RUN (or while AGENT_REQUIRE_APPROVAL=true) every email is
// redirected to the operator (AGENT_ADMIN_EMAIL) instead of the user, so the
// founder eyeballs real content before subscribers get it. Users with zero
// matching deals are skipped — never send a "no deals" email.

type Pick = ReturnType<typeof queries.recentVerifiedPicks>[number];

const DigestOutput = z.object({
  subject: z.string().min(3).max(80),
  preheader: z.string().max(140).optional(),
  intro: z.string().min(3),
  outro: z.string().optional(),
  deals: z.array(z.object({
    pick_id: z.number(),
    headline: z.string().min(3).max(120),
    blurb: z.string().min(5).max(400),
  })).min(1).max(6),
});

const BASE = 'https://flycheap.18dn.com';
function bookUrl(p: Pick) {
  const to = `https://www.aviasales.com/search/${p.origin}${p.outbound_date.slice(5).replace('-', '')}${p.destination}${p.return_date.slice(5).replace('-', '')}1`;
  return `${BASE}/go?to=${encodeURIComponent(to)}&surface=agent-email`;
}

function matchPicksForUser(allPicks: Pick[], routes: Array<{ origin: string; destination: string }>): Pick[] {
  const exact = new Set(routes.map(r => `${r.origin}->${r.destination}`));
  const origins = new Set(routes.map(r => r.origin));
  // Prefer exact route matches; fall back to same-origin deals so a tracker of
  // JFK→CAI still hears about a great JFK→FCO fare.
  const exactMatches = allPicks.filter(p => exact.has(`${p.origin}->${p.destination}`));
  const originMatches = allPicks.filter(p => origins.has(p.origin) && !exact.has(`${p.origin}->${p.destination}`));
  return [...exactMatches, ...originMatches].slice(0, 8);
}

export async function runEmailDigest(): Promise<{
  runId: number; model: string; dryRun: boolean;
  results: Array<{ userId: number; to: string; redirected: boolean; sent: boolean; deals: number; note: string }>;
}> {
  const dryRun = isDryRun();
  const requireApproval = (process.env.AGENT_REQUIRE_APPROVAL ?? 'true').toLowerCase() !== 'false';
  const operator = (process.env.AGENT_ADMIN_EMAIL ?? '').trim();
  const model = MODELS.insights; // sonnet
  if (!hasApiKey()) throw new Error('ANTHROPIC_API_KEY not set — digest cannot run');

  const runId = startRun('email-digest', model, dryRun);
  const startMs = Date.now();
  const results: Array<{ userId: number; to: string; redirected: boolean; sent: boolean; deals: number; note: string }> = [];

  try {
    const allPicks = queries.recentVerifiedPicks(48, 60);
    const users = queries.usersWithActiveSearches();
    if (allPicks.length === 0 || users.length === 0) {
      finishRun(runId, { ok: true, durationMs: Date.now() - startMs, summary: `no picks (${allPicks.length}) or no users (${users.length})`, output: { results: [] } });
      return { runId, model, dryRun, results };
    }

    let pinged = false;
    for (const user of users) {
      const routes = queries.trackedRoutesForUser(user.id);
      const matches = matchPicksForUser(allPicks, routes);
      if (matches.length === 0) {
        results.push({ userId: user.id, to: user.email, redirected: false, sent: false, deals: 0, note: 'no matching deals — skipped' });
        continue;
      }
      if (!pinged) {
        if (!(await pingModel(model))) throw new Error(`model ping failed: ${model}`);
        pinged = true;
      }

      const firstName = (user.name ?? '').split(' ')[0] || 'there';
      const dealLines = matches.map(p => ({
        pick_id: p.id, origin: p.origin, destination: p.destination,
        per_adult_usd: Math.round(p.per_adult_usd), outbound_date: p.outbound_date,
        return_date: p.return_date, trip_length_days: p.trip_length_days, score: p.score,
        headline: p.headline, blurb: p.blurb,
      }));

      const out = await completeJSON({
        model,
        system: `${BRAND_VOICE}\n\nYou write a personalized FlyCheap deal digest. The subject names the single best deal specifically (route + price). No clickbait. Output JSON matching the schema; echo each chosen pick_id exactly.`,
        user: [
          `Write a digest for ${firstName}.`,
          `Their tracked routes: ${routes.map(r => `${r.origin}->${r.destination}`).join(', ') || '(none specific)'}`,
          `Candidate verified deals (JSON), ordered by score:`,
          JSON.stringify(dealLines, null, 2),
          `Pick the 3-6 most worth their attention, best savings first.`,
        ].join('\n'),
        schema: DigestOutput,
        maxTokens: 1200,
      });

      const byId = new Map(matches.map(p => [p.id, p]));
      const cards: DigestDealCard[] = out.deals.flatMap(d => {
        const p = byId.get(d.pick_id);
        if (!p) return [];
        return [{
          headline: d.headline,
          blurb: d.blurb,
          route: `${p.origin} → ${p.destination}`,
          price: `$${Math.round(p.per_adult_usd)}`,
          dates: `${fmtDate(p.outbound_date)} – ${fmtDate(p.return_date)}`,
          bookUrl: bookUrl(p),
        }];
      });
      if (cards.length === 0) {
        results.push({ userId: user.id, to: user.email, redirected: false, sent: false, deals: 0, note: 'model returned no resolvable picks — skipped' });
        continue;
      }

      // Gate: redirect to operator while in dry-run/approval mode.
      const redirected = dryRun || requireApproval;
      const to = redirected ? operator : user.email;
      if (!to) {
        results.push({ userId: user.id, to: user.email, redirected, sent: false, deals: cards.length, note: 'no recipient (AGENT_ADMIN_EMAIL unset) — not sent' });
        continue;
      }
      const subject = redirected ? `[preview · ${user.email}] ${out.subject}` : out.subject;
      const res = await sendDigestEmail({ to, subject, preheader: out.preheader, intro: out.intro, outro: out.outro, deals: cards });
      results.push({
        userId: user.id, to, redirected, sent: res.ok, deals: cards.length,
        note: res.ok ? `sent (id=${res.id})` : `failed: ${res.error}`,
      });
    }

    const sent = results.filter(r => r.sent).length;
    finishRun(runId, {
      ok: true, durationMs: Date.now() - startMs,
      summary: `${sent}/${results.length} emails sent · redirected=${dryRun || requireApproval} · DRY_RUN=${dryRun}`,
      output: { results },
    });
    return { runId, model, dryRun, results };
  } catch (e) {
    finishRun(runId, { ok: false, durationMs: Date.now() - startMs, error: (e as Error).message });
    throw e;
  }
}

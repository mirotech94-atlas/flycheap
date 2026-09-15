import 'server-only';
import { queries } from './db';

// Per-user Route Intelligence pipeline.
//
// Runs nightly: for each user, pull their 60-day fare history, compute
// deterministic stats (DOW/hour/trip-length modes, percentile bands, top route
// summaries), and optionally call Claude to produce a short prose narrative
// for the dashboard. Result is upserted into user_route_intel — one row per
// user. The dashboard reads it as a server component on every render.

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type RouteIntelStats = {
  user_id: number;
  generated_at: string;
  polls_observed: number;
  // Per-route rollups (cheapest, median, day-of-week mode, hour mode).
  routes: Array<{
    origin: string;
    destination: string;
    polls: number;
    cheapest_per_adult: number;
    median_per_adult: number;
    current_per_adult: number | null;
    best_dow: string | null;       // 'Tue' etc.
    best_hour: number | null;      // 0-23
    cheapest_month: string | null; // 'Feb' etc.
    sweet_spot_trip_days: number | null;
    delta_vs_median_pct: number | null;
  }>;
  // High-level user findings — short bullets the dashboard renders even when
  // the LLM prose hasn't been generated yet.
  bullets: string[];
};

function mode<T extends string | number>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T = values[0];
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return best;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Pure stats: no LLM call. Deterministic, safe to run for every user every
 * night without rate-limit concerns.
 */
export function computeUserStats(userId: number, daysBack = 60): RouteIntelStats {
  const polls = queries.fareSnapshotsForUser(userId, daysBack);
  const generated_at = new Date().toISOString();

  // Group polls by (origin, destination) so each user can have many routes.
  const byRoute = new Map<string, typeof polls>();
  for (const p of polls) {
    const k = `${p.origin}|${p.destination}`;
    if (!byRoute.has(k)) byRoute.set(k, []);
    byRoute.get(k)!.push(p);
  }

  const routes: RouteIntelStats['routes'] = [];
  for (const [key, group] of byRoute) {
    if (group.length === 0) continue;
    const [origin, destination] = key.split('|');
    const prices = group.map(g => g.price_per_adult_usd);
    const cheapest_per_adult = Math.min(...prices);
    const median_per_adult = median(prices);
    // Cheapest-25% subset → infer "best" DOW / hour / month using its mode.
    const cutoff = [...prices].sort((a, b) => a - b)[Math.max(0, Math.floor(prices.length * 0.25) - 1)];
    const winners = group.filter(g => g.price_per_adult_usd <= cutoff);
    const dowVals = winners
      .map(w => w.outbound_depart_iso ? new Date(w.outbound_depart_iso).getUTCDay() : null)
      .filter((v): v is number => v !== null);
    const hourVals = winners
      .map(w => w.outbound_depart_iso ? new Date(w.outbound_depart_iso).getUTCHours() : null)
      .filter((v): v is number => v !== null);
    const monthVals = winners
      .map(w => w.depart_date ? Number(w.depart_date.slice(5, 7)) - 1 : null)
      .filter((v): v is number => v !== null && v >= 0 && v < 12);
    const tripDaysVals = winners
      .map(w => {
        if (!w.depart_date || !w.return_date) return null;
        return Math.round(
          (new Date(w.return_date).getTime() - new Date(w.depart_date).getTime()) / 86400000
        );
      })
      .filter((v): v is number => v !== null && v > 0 && v < 90);
    const newest = [...group].sort((a, b) => (a.polled_at < b.polled_at ? 1 : -1))[0];
    const current_per_adult = newest ? newest.price_per_adult_usd : null;
    const delta = current_per_adult && median_per_adult
      ? ((current_per_adult - median_per_adult) / median_per_adult) * 100
      : null;

    const dowIdx = mode(dowVals);
    const monthIdx = mode(monthVals);
    routes.push({
      origin, destination,
      polls: group.length,
      cheapest_per_adult: Math.round(cheapest_per_adult),
      median_per_adult: Math.round(median_per_adult),
      current_per_adult: current_per_adult ? Math.round(current_per_adult) : null,
      best_dow: dowIdx !== null ? DOW_NAMES[dowIdx] : null,
      best_hour: mode(hourVals),
      cheapest_month: monthIdx !== null ? MONTH_NAMES[monthIdx] : null,
      sweet_spot_trip_days: mode(tripDaysVals),
      delta_vs_median_pct: delta != null ? Math.round(delta) : null,
    });
  }
  routes.sort((a, b) => b.polls - a.polls);

  // Aggregate bullets — the deterministic-only summary the dashboard can
  // show before the LLM call lands (or if the LLM is disabled).
  const bullets: string[] = [];
  if (routes.length === 0) {
    bullets.push('No tracked-route polls yet. Once a few cycles run, your pattern will show up here.');
  } else {
    const top = routes[0];
    if (top.best_dow) bullets.push(`Your cheapest ${top.origin}→${top.destination} fares cluster on ${top.best_dow} departures.`);
    if (top.cheapest_month) bullets.push(`${top.cheapest_month} has historically been the cheapest month for ${top.origin}→${top.destination}.`);
    if (top.sweet_spot_trip_days) bullets.push(`Sweet-spot trip length: ${top.sweet_spot_trip_days} days.`);
    if (top.delta_vs_median_pct != null) {
      bullets.push(
        top.delta_vs_median_pct < -5
          ? `Right now ${top.origin}→${top.destination} is ${Math.abs(top.delta_vs_median_pct)}% below its 60-day median — strong buy signal.`
          : top.delta_vs_median_pct > 5
            ? `${top.origin}→${top.destination} is ${top.delta_vs_median_pct}% above its 60-day median — likely worth waiting.`
            : `${top.origin}→${top.destination} is within ±5% of its 60-day median — no strong signal.`
      );
    }
    if (routes.length > 1) bullets.push(`Tracking ${routes.length} distinct routes; pattern is strongest on the one above.`);
  }

  return {
    user_id: userId,
    generated_at,
    polls_observed: polls.length,
    routes,
    bullets,
  };
}

/**
 * Optional LLM polish. Takes the deterministic stats and asks Claude for a
 * short, decision-friendly narrative. Falls back to bullets-only if the
 * Anthropic key is missing or the call errors — caller should never assume
 * prose is present.
 */
export async function generateProse(stats: RouteIntelStats): Promise<{ prose: string | null; model: string | null }> {
  if (stats.routes.length === 0) return { prose: null, model: null };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { prose: null, model: null };
  // Cap on tokens / per-user generation count is enforced by the route-intel
  // job's outer scheduling — one summary per user per day max.
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const model = 'claude-haiku-4-5-20251001';
    const system =
      'You are a flight-deal analyst. Given a user\'s tracked-route pattern stats, write a 2-4 sentence narrative that highlights the SINGLE most actionable insight: best day to fly, cheapest month, or current buy/wait signal. Speak directly to the user ("your", "you"). No bullet points, no headers, no caveats — just the punchy summary. Keep it under 60 words.';
    const userMsg =
      `Stats JSON for the user's tracked routes (60-day window):\n${JSON.stringify(stats.routes.slice(0, 5), null, 2)}\n\nReturn ONLY the narrative paragraph. No preamble.`;
    const res = await client.messages.create({
      model,
      max_tokens: 220,
      system,
      messages: [{ role: 'user', content: userMsg }],
    });
    const text = res.content
      .flatMap(b => (b.type === 'text' ? [b.text] : []))
      .join('\n')
      .trim();
    return { prose: text || null, model };
  } catch (e) {
    console.error('[route-intel] LLM prose generation failed:', (e as Error).message);
    return { prose: null, model: null };
  }
}

/**
 * Top-level: run stats + prose for every user with >= 1 tracked search,
 * upsert into user_route_intel.
 */
export async function runRouteIntelForAllUsers(): Promise<{
  users: number;
  withProse: number;
  errors: number;
}> {
  const userIds = queries.listAllUserIds();
  let withProse = 0;
  let errors = 0;
  for (const uid of userIds) {
    try {
      const stats = computeUserStats(uid, 60);
      // Skip users with zero polls — pointless to upsert a empty row and
      // pointless to call the LLM.
      if (stats.polls_observed === 0) continue;
      const { prose, model } = await generateProse(stats);
      if (prose) withProse++;
      queries.upsertUserRouteIntel(uid, {
        polls_observed: stats.polls_observed,
        stats_json: JSON.stringify(stats),
        prose,
        model,
      });
    } catch (e) {
      console.error(`[route-intel] user ${uid} failed:`, (e as Error).message);
      errors++;
    }
  }
  return { users: userIds.length, withProse, errors };
}

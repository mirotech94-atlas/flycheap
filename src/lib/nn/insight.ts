/**
 * The network's view of live routes, for the two Model pages.
 *
 * One loader, two audiences: a client sees their own watches; the admin sees
 * every client's. Both get the same shape per route — what the rules said,
 * what the network said, whether they agreed, the probabilities, and the
 * inputs the network actually looked at — so the admin page is the client
 * page with a "who" column, not a second implementation.
 *
 * Read-only. Nothing here records a verdict; that is the poller's job.
 */

import { queries } from '@/lib/db';
import { decide } from './index';
import { featurize, FEATURE_NAMES, type FareClass } from './fareModel';
import type { BlendSource } from './verdictBlend';

export type RouteInsight = {
  searchId: number;
  userId: number;
  route: string;            // "JFK → CAI"
  origin: string;
  destination: string;
  departDate: string | null;
  currentPrice: number | null;
  targetPerAdult: number | null;
  /** Days of daily history behind this decision. */
  historyDays: number;
  /** The decision as the product shows it (rules + model blended). */
  verdict: 'buy' | 'wait' | 'hold' | null;
  confidencePct: number | null;
  reason: string | null;
  source: BlendSource | 'no-fare' | 'no-verdict';
  /** What the rules alone said, before the model had a say. */
  rulesVerdict: 'buy' | 'wait' | 'hold' | null;
  /** The network's probabilities, when it had a view. */
  probs: Record<FareClass, number> | null;
  /** The inputs the network looked at, named, for the "why" panel. */
  features: Array<{ name: string; value: number }> | null;
};

export type InsightSummary = {
  routes: number;
  withModelView: number;
  agreed: number;
  overridden: number;
  rulesOnlyThin: number;
  byVerdict: Record<'buy' | 'wait' | 'hold', number>;
};

type SearchLike = {
  id: number; user_id: number; origin: string; destination: string;
  depart_date: string | null; target_per_adult_usd?: number | null; target_amount?: number | null;
};

const DEFAULT_TARGET = 700;

function insightFor(s: SearchLike): RouteInsight {
  const daily = queries.fareHistoryDaily(s.id, 30).map(r => ({ polled_at: r.day, price_per_adult_usd: r.per_adult_usd }));
  const latest = queries.latestFare(s.id);
  const target = s.target_per_adult_usd ?? s.target_amount ?? null;
  const base: RouteInsight = {
    searchId: s.id, userId: s.user_id,
    route: `${s.origin} → ${s.destination}`, origin: s.origin, destination: s.destination,
    departDate: s.depart_date ?? null,
    currentPrice: latest?.price_per_adult_usd ?? null,
    targetPerAdult: target,
    historyDays: daily.length,
    verdict: null, confidencePct: null, reason: null, source: 'no-fare',
    rulesVerdict: null, probs: null, features: null,
  };
  if (!latest) return base;

  const v = decide(daily, latest.price_per_adult_usd, target ?? DEFAULT_TARGET, { departDate: s.depart_date ?? null });
  if (!v) return { ...base, source: 'no-verdict' };

  const f = featurize({ history: daily, currentPrice: latest.price_per_adult_usd, asOf: new Date().toISOString(), departDate: s.depart_date ?? null });
  return {
    ...base,
    verdict: v.verdict, confidencePct: v.confidencePct, reason: v.reason, source: v.source,
    rulesVerdict: v.rulesVerdict,
    probs: v.modelProbs,
    features: f ? FEATURE_NAMES.map((name, i) => ({ name, value: f[i] })) : null,
  };
}

function summarize(rows: RouteInsight[]): InsightSummary {
  const s: InsightSummary = { routes: rows.length, withModelView: 0, agreed: 0, overridden: 0, rulesOnlyThin: 0, byVerdict: { buy: 0, wait: 0, hold: 0 } };
  for (const r of rows) {
    if (r.verdict) s.byVerdict[r.verdict]++;
    if (r.probs) s.withModelView++;
    if (r.source === 'model-agrees') s.agreed++;
    if (r.source === 'model-override') s.overridden++;
    if (r.source === 'rules-only-thin-history') s.rulesOnlyThin++;
  }
  return s;
}

/** A client's own active watches. */
export function insightsForUser(userId: number): { rows: RouteInsight[]; summary: InsightSummary } {
  const rows = (queries.listActiveSearchesForUser(userId) as unknown as SearchLike[]).map(insightFor);
  return { rows, summary: summarize(rows) };
}

/** Every active watch across every client, for the admin view. */
export function insightsForAll(): { rows: Array<RouteInsight & { userEmail: string; userName: string | null }>; summary: InsightSummary } {
  const all = queries.listSearches() as unknown as Array<SearchLike & { active: number }>;
  const users = new Map<number, { email: string; name: string | null }>();
  const rows = all.filter(s => s.active === 1).map(s => {
    if (!users.has(s.user_id)) {
      const u = queries.getUserById?.(s.user_id) as { email: string; name: string | null } | undefined;
      users.set(s.user_id, { email: u?.email ?? `user ${s.user_id}`, name: u?.name ?? null });
    }
    const u = users.get(s.user_id)!;
    return { ...insightFor(s), userEmail: u.email, userName: u.name };
  });
  return { rows, summary: summarize(rows) };
}

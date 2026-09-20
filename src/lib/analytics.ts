import 'server-only';
import { getDb } from './db';
import { verdictAccuracy } from './verdictScoring';

/**
 * The numbers behind the three admin dashboards.
 *
 * Dashboard 1 — is the engine telling the truth?
 * Dashboard 2 — what is it costing, and what is it earning?
 * Dashboard 3 — does the funnel work?
 *
 * Every figure here is DERIVED. Nothing in this file may return a typed-in
 * number, and anything that cannot be computed from the tables returns null so
 * the page can say "not enough data yet" instead of showing a confident zero.
 * A dashboard that reports 0% when it means "unknown" is worse than no
 * dashboard, because it gets acted on.
 */

const db = () => getDb();

function one<T>(sql: string, ...params: unknown[]): T {
  return db().prepare(sql).get(...params) as T;
}
function all<T>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

/** Percentile from a sorted numeric array. Null on an empty set. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// ===========================================================================
// Dashboard 1 — is the engine telling the truth?
// ===========================================================================

export type TrustMetrics = {
  /** Alert-to-click price delta, in percent. Null until clicks carry both prices. */
  deltaMedianPct: number | null;
  deltaP90Pct: number | null;
  deltaSamples: number;
  /** Share of alerts suppressed because the fare could not be verified. */
  deadFareRatePct: number | null;
  deadFares7d: number;
  alertsConsidered7d: number;
  /** Raw suppression events, against deadFares7d's distinct route-days. */
  deadFareEvents7d: number;
  /** Provider pairs that materially disagree, and how often. */
  disagreements: Array<{ pair: string; n: number; medianDeltaPct: number }>;
  /** Verdict accuracy at 7 days — the number to publish once it is good. */
  verdict7d: ReturnType<typeof verdictAccuracy>;
  verdict14d: ReturnType<typeof verdictAccuracy>;
  /** Poll success rate per provider over 7 days. */
  providerSuccess: Array<{ provider: string; calls: number; okPct: number }>;
  /** Alerts whose delta exceeded the hard threshold and need a route audit. */
  flagged: Array<{
    token: string; origin: string | null; destination: string | null;
    shown: number; atClick: number; deltaPct: number; occurred_at: string;
  }>;
};

/** Any alert whose alert-to-click delta exceeds this is flagged and audited. */
export const HARD_DELTA_THRESHOLD_PCT = 10;

export function trustMetrics(days = 7): TrustMetrics {
  const window = `-${Math.floor(days)} days`;

  // Price shown at alert vs price at landing — the metric that governs the
  // product. Only clicks where we actually re-queried count; a click with no
  // re-query is absent evidence, not a zero delta.
  const deltas = all<{ d: number }>(
    `SELECT ((price_at_click_usd - price_shown_usd) / price_shown_usd) * 100 AS d
       FROM affiliate_clicks
      WHERE price_shown_usd > 0 AND price_at_click_usd IS NOT NULL
        AND occurred_at >= datetime('now', ?)`,
    window,
  ).map(r => r.d).filter(d => Number.isFinite(d)).sort((a, b) => a - b);

  // Per ALERT OPPORTUNITY, not per suppression attempt. A fare that is stuck and
  // bogus keeps its route in the hot band, so it re-suppresses every five
  // minutes — counting raw rows would put twelve hours of one bad fare at ~144
  // against a handful of real alerts and show ~99% against a 2% target. Distinct
  // (search, day) is the honest denominator: one route having one bad day.
  const deadFares7d = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (
       SELECT DISTINCT search_id, date(occurred_at) AS d FROM dead_fares
        WHERE occurred_at >= datetime('now', ?))`, window,
  ).n;
  /** Raw suppression events — how much provider spend the stuck fares are burning. */
  const deadFareEvents7d = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM dead_fares WHERE occurred_at >= datetime('now', ?)`, window,
  ).n;
  const alertsSent7d = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM alerts_sent WHERE status = 'sent' AND sent_at >= datetime('now', ?)`, window,
  ).n;
  const considered = deadFares7d + alertsSent7d;

  const disagreements = all<{ a: string; b: string; n: number }>(
    `SELECT provider_a AS a, provider_b AS b, COUNT(*) AS n
       FROM provider_disagreements WHERE occurred_at >= datetime('now', ?)
      GROUP BY provider_a, provider_b ORDER BY n DESC LIMIT 12`,
    window,
  ).map(r => {
    const ds = all<{ d: number }>(
      `SELECT ABS(delta_pct) AS d FROM provider_disagreements
        WHERE provider_a = ? AND provider_b = ? AND occurred_at >= datetime('now', ?)
        ORDER BY ABS(delta_pct)`,
      r.a, r.b, window,
    ).map(x => x.d);
    return { pair: `${r.a} ↔ ${r.b}`, n: r.n, medianDeltaPct: percentile(ds, 0.5) ?? 0 };
  });

  const providerSuccess = all<{ provider: string; calls: number; oks: number }>(
    `SELECT COALESCE(provider, 'unattributed') AS provider,
            COUNT(*) AS calls, SUM(ok) AS oks
       FROM api_calls WHERE called_at >= datetime('now', ?)
      GROUP BY provider ORDER BY calls DESC`,
    window,
  ).map(r => ({
    provider: r.provider,
    calls: r.calls,
    okPct: r.calls > 0 ? (r.oks / r.calls) * 100 : 0,
  }));

  const flagged = all<{
    token: string; origin: string | null; destination: string | null;
    shown: number; atClick: number; occurred_at: string;
  }>(
    `SELECT token, origin, destination,
            price_shown_usd AS shown, price_at_click_usd AS atClick, occurred_at
       FROM affiliate_clicks
      WHERE price_shown_usd > 0 AND price_at_click_usd IS NOT NULL
        AND ABS((price_at_click_usd - price_shown_usd) / price_shown_usd) * 100 >= ?
        AND occurred_at >= datetime('now', ?)
      ORDER BY ABS((price_at_click_usd - price_shown_usd) / price_shown_usd) DESC LIMIT 25`,
    HARD_DELTA_THRESHOLD_PCT, window,
  ).map(r => ({ ...r, deltaPct: ((r.atClick - r.shown) / r.shown) * 100 }));

  return {
    deltaMedianPct: percentile(deltas, 0.5),
    deltaP90Pct: percentile(deltas, 0.9),
    deltaSamples: deltas.length,
    deadFareRatePct: considered > 0 ? (deadFares7d / considered) * 100 : null,
    deadFares7d,
    deadFareEvents7d,
    alertsConsidered7d: considered,
    disagreements,
    verdict7d: verdictAccuracy(7),
    verdict14d: verdictAccuracy(14),
    providerSuccess,
    flagged,
  };
}

// ===========================================================================
// Dashboard 2 — what is it costing, and what is it earning?
// ===========================================================================

export type CostEarnMetrics = {
  spendByProvider: Array<{ provider: string; calls: number; costUsd: number }>;
  spendByPhase: Array<{ phase: string; calls: number; costUsd: number }>;
  spendByDay: Array<{ day: string; costUsd: number }>;
  totalCostUsd: number;
  trackedRoutes: number;
  costPerTrackedRouteUsd: number | null;
  costPerAlertUsd: number | null;
  costPerClickOutUsd: number | null;
  commissionByProduct: Array<{ product: string; n: number; amountUsd: number }>;
  /** Margin per active route: attributable commission minus poll cost. */
  routeMargin: Array<{
    routeKey: string; origin: string; destination: string;
    pollCostUsd: number; commissionUsd: number; marginUsd: number; clicks: number;
  }>;
  /** Share of click-outs going to carriers/partners that pay nothing. */
  zeroCommissionSharePct: number | null;
  zeroCommissionByRoute: Array<{ route: string; clicks: number; zero: number; pct: number }>;
  subscriptionVsCost: Array<{
    userId: number; email: string; tier: string;
    pollCostUsd: number; routes: number;
  }>;
};

/**
 * Partners with no commission program. Click-outs here earn nothing, which is
 * the whole argument for the trip chain: on these bookings the chain is not
 * optional, it is the only path to revenue.
 */
const ZERO_COMMISSION_PROVIDERS = new Set(['google', 'kayak', 'momondo', 'airbnb', 'vrbo', 'skyscanner']);

export function costEarnMetrics(days = 30): CostEarnMetrics {
  const window = `-${Math.floor(days)} days`;

  const spendByProvider = all<{ provider: string; calls: number; costUsd: number }>(
    `SELECT COALESCE(provider, 'unattributed') AS provider,
            COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS costUsd
       FROM api_calls WHERE called_at >= datetime('now', ?)
      GROUP BY provider ORDER BY costUsd DESC, calls DESC`,
    window,
  );

  const spendByPhase = all<{ phase: string; calls: number; costUsd: number }>(
    `SELECT COALESCE(phase, 'sweep') AS phase,
            COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS costUsd
       FROM api_calls WHERE called_at >= datetime('now', ?)
      GROUP BY phase ORDER BY costUsd DESC`,
    window,
  );

  const spendByDay = all<{ day: string; costUsd: number }>(
    `SELECT date(called_at) AS day, COALESCE(SUM(cost_usd), 0) AS costUsd
       FROM api_calls WHERE called_at >= datetime('now', ?)
      GROUP BY date(called_at) ORDER BY day`,
    window,
  );

  const totalCostUsd = spendByProvider.reduce((s, r) => s + r.costUsd, 0);
  const trackedRoutes = one<{ n: number }>(`SELECT COUNT(*) AS n FROM searches WHERE active = 1`).n;
  const alerts = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM alerts_sent WHERE status = 'sent' AND sent_at >= datetime('now', ?)`, window,
  ).n;
  const clicks = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM affiliate_clicks WHERE occurred_at >= datetime('now', ?)`, window,
  ).n;

  const commissionByProduct = all<{ product: string; n: number; amountUsd: number }>(
    `SELECT COALESCE(c.product, 'unattributed') AS product,
            COUNT(*) AS n, COALESCE(SUM(ce.amount_usd), 0) AS amountUsd
       FROM commission_events ce
       LEFT JOIN affiliate_clicks c ON c.token = ce.click_token
      WHERE ce.received_at >= datetime('now', ?)
      GROUP BY product ORDER BY amountUsd DESC`,
    window,
  );

  // Margin per route. Poll cost joins on route_key; commission joins through the
  // click token. Sorted ascending on purpose — the routes at the TOP are the
  // ones to throttle.
  const routeMargin = all<{
    routeKey: string; origin: string; destination: string;
    pollCostUsd: number; commissionUsd: number; clicks: number;
  }>(
    `SELECT a.route_key AS routeKey,
            COALESCE(s.origin, '?') AS origin,
            COALESCE(s.destination, '?') AS destination,
            COALESCE(SUM(a.cost_usd), 0) AS pollCostUsd,
            COALESCE((
              SELECT SUM(ce.amount_usd) FROM commission_events ce
              JOIN affiliate_clicks ac ON ac.token = ce.click_token
              WHERE ac.search_id = a.search_id
                AND ce.received_at >= datetime('now', ?)
            ), 0) AS commissionUsd,
            COALESCE((
              SELECT COUNT(*) FROM affiliate_clicks ac2
              WHERE ac2.search_id = a.search_id AND ac2.occurred_at >= datetime('now', ?)
            ), 0) AS clicks
       FROM api_calls a
       LEFT JOIN searches s ON s.id = a.search_id
      WHERE a.called_at >= datetime('now', ?) AND a.route_key IS NOT NULL
      GROUP BY a.route_key
      ORDER BY (COALESCE(SUM(a.cost_usd), 0) * -1) ASC`,
    window, window, window,
  ).map(r => ({ ...r, marginUsd: r.commissionUsd - r.pollCostUsd }))
    .sort((a, b) => a.marginUsd - b.marginUsd);

  const providerClicks = all<{ provider: string | null; n: number }>(
    `SELECT provider, COUNT(*) AS n FROM affiliate_clicks
      WHERE occurred_at >= datetime('now', ?) GROUP BY provider`,
    window,
  );
  const totalClicks = providerClicks.reduce((s, r) => s + r.n, 0);
  const zeroClicks = providerClicks
    .filter(r => r.provider && ZERO_COMMISSION_PROVIDERS.has(r.provider))
    .reduce((s, r) => s + r.n, 0);

  const zeroCommissionByRoute = all<{ route: string; clicks: number; zero: number }>(
    `SELECT (COALESCE(origin,'?') || '→' || COALESCE(destination,'?')) AS route,
            COUNT(*) AS clicks,
            SUM(CASE WHEN provider IN (${[...ZERO_COMMISSION_PROVIDERS].map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS zero
       FROM affiliate_clicks WHERE occurred_at >= datetime('now', ?)
      GROUP BY route HAVING clicks > 0 ORDER BY zero DESC LIMIT 15`,
    ...[...ZERO_COMMISSION_PROVIDERS], window,
  ).map(r => ({ ...r, pct: r.clicks > 0 ? (r.zero / r.clicks) * 100 : 0 }));

  const subscriptionVsCost = all<{
    userId: number; email: string; tier: string; pollCostUsd: number; routes: number;
  }>(
    `SELECT u.id AS userId, u.email, u.tier,
            COALESCE((
              SELECT SUM(a.cost_usd) FROM api_calls a
              JOIN searches s2 ON s2.id = a.search_id
              WHERE s2.user_id = u.id AND a.called_at >= datetime('now', ?)
            ), 0) AS pollCostUsd,
            (SELECT COUNT(*) FROM searches s3 WHERE s3.user_id = u.id AND s3.active = 1) AS routes
       FROM users u
      ORDER BY pollCostUsd DESC LIMIT 50`,
    window,
  );

  return {
    spendByProvider, spendByPhase, spendByDay, totalCostUsd, trackedRoutes,
    costPerTrackedRouteUsd: trackedRoutes > 0 ? totalCostUsd / trackedRoutes : null,
    costPerAlertUsd: alerts > 0 ? totalCostUsd / alerts : null,
    costPerClickOutUsd: clicks > 0 ? totalCostUsd / clicks : null,
    commissionByProduct,
    routeMargin,
    zeroCommissionSharePct: totalClicks > 0 ? (zeroClicks / totalClicks) * 100 : null,
    zeroCommissionByRoute,
    subscriptionVsCost,
  };
}

// ===========================================================================
// Dashboard 3 — does the funnel work?
// ===========================================================================

export type FunnelStage = { stage: string; n: number; ofPreviousPct: number | null };

export type FunnelMetrics = {
  overall: FunnelStage[];
  byAlertKind: Array<{ kind: string; sent: number; clicked: number; ctrPct: number; commissionUsd: number }>;
  /** Clicks by emitting surface. This is the spec's "channel" cut — in this
   *  codebase the surface IS the channel (email-alert, telegram, share-page…). */
  byChannel: Array<{ channel: string; clicks: number }>;
  byProduct: Array<{ product: string; clicks: number }>;
  /** Cohort retention: of users who set a route in month 0, how many are still
   *  active in month N, and how many ever produced a click-out. */
  cohorts: Array<{
    cohort: string; users: number;
    activeM1: number; activeM3: number; everClicked: number;
  }>;
};

export function funnelMetrics(days = 30): FunnelMetrics {
  const window = `-${Math.floor(days)} days`;

  const sent = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM alerts_sent WHERE status = 'sent' AND sent_at >= datetime('now', ?)`, window,
  ).n;
  const clicked = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM affiliate_clicks
      WHERE alert_id IS NOT NULL AND occurred_at >= datetime('now', ?)`, window,
  ).n;
  const hotelClicked = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM affiliate_clicks
      WHERE product = 'hotel' AND occurred_at >= datetime('now', ?)`, window,
  ).n;
  const ancillaryClicked = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM affiliate_clicks
      WHERE product IN ('transfer','car','insurance','esim','tour','compensation')
        AND occurred_at >= datetime('now', ?)`, window,
  ).n;
  const settled = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM commission_events WHERE received_at >= datetime('now', ?)`, window,
  ).n;

  const raw: Array<{ stage: string; n: number }> = [
    { stage: 'alert sent', n: sent },
    { stage: 'clicked', n: clicked },
    { stage: 'hotel clicked', n: hotelClicked },
    { stage: 'ancillary clicked', n: ancillaryClicked },
    { stage: 'commission settled', n: settled },
  ];
  const overall: FunnelStage[] = raw.map((r, i) => ({
    ...r,
    ofPreviousPct: i === 0 ? null : raw[i - 1].n > 0 ? (r.n / raw[i - 1].n) * 100 : null,
  }));

  const byAlertKind = all<{ kind: string; sent: number }>(
    `SELECT kind, COUNT(*) AS sent FROM alerts_sent
      WHERE status = 'sent' AND sent_at >= datetime('now', ?) GROUP BY kind`,
    window,
  ).map(r => {
    const c = one<{ n: number; amt: number }>(
      `SELECT COUNT(*) AS n,
              COALESCE((SELECT SUM(ce.amount_usd) FROM commission_events ce
                        JOIN affiliate_clicks ac ON ac.token = ce.click_token
                        WHERE ac.alert_kind = ?), 0) AS amt
         FROM affiliate_clicks
        WHERE alert_kind = ? AND occurred_at >= datetime('now', ?)`,
      r.kind, r.kind, window,
    );
    return {
      kind: r.kind, sent: r.sent, clicked: c.n,
      ctrPct: r.sent > 0 ? (c.n / r.sent) * 100 : 0,
      commissionUsd: c.amt,
    };
  }).sort((a, b) => b.sent - a.sent);

  const byChannel = all<{ channel: string; clicks: number }>(
    `SELECT COALESCE(surface, 'untagged') AS channel, COUNT(*) AS clicks
       FROM affiliate_clicks WHERE occurred_at >= datetime('now', ?)
      GROUP BY surface ORDER BY clicks DESC LIMIT 20`,
    window,
  );
  const byProduct = all<{ product: string; clicks: number }>(
    `SELECT COALESCE(product, 'unattributed') AS product, COUNT(*) AS clicks
       FROM affiliate_clicks WHERE occurred_at >= datetime('now', ?)
      GROUP BY product ORDER BY clicks DESC`,
    window,
  );

  // Cohorts by signup month. "Still has an active route" and "ever produced a
  // click-out" are the two questions that matter: flight tracking has a natural
  // decay, so the metric is whether people come back for the next trip.
  const cohorts = all<{
    cohort: string; users: number; activeM1: number; activeM3: number; everClicked: number;
  }>(
    `SELECT strftime('%Y-%m', u.created_at) AS cohort,
            COUNT(DISTINCT u.id) AS users,
            COUNT(DISTINCT CASE WHEN EXISTS (
              SELECT 1 FROM searches s WHERE s.user_id = u.id AND s.active = 1
                AND s.created_at >= datetime(u.created_at, '+1 month')
            ) THEN u.id END) AS activeM1,
            COUNT(DISTINCT CASE WHEN EXISTS (
              SELECT 1 FROM searches s WHERE s.user_id = u.id AND s.active = 1
                AND s.created_at >= datetime(u.created_at, '+3 months')
            ) THEN u.id END) AS activeM3,
            COUNT(DISTINCT CASE WHEN EXISTS (
              SELECT 1 FROM affiliate_clicks c WHERE c.user_id = u.id
            ) THEN u.id END) AS everClicked
       FROM users u
      GROUP BY cohort ORDER BY cohort DESC LIMIT 12`,
  );

  return { overall, byAlertKind, byChannel, byProduct, cohorts };
}

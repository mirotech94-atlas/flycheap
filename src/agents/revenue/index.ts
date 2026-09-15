import 'server-only';
import { MODELS, complete, hasApiKey, isDryRun, pingModel } from '../shared/client';
import { startRun, finishRun } from '../shared/storage';
import { BRAND_VOICE } from '../shared/voice';
import { queries, getDb } from '@/lib/db';
import { sendOperatorBrief } from '@/lib/email';
import type { RevenueResult } from '../shared/types';

// ---------------------------------------------------------------------------
// Revenue agent. Answers exactly one question: "has REAL money arrived since
// the last run, and where did it come from?"
//
// Hard rule, learned the expensive way: this agent NEVER invents, estimates or
// forecasts a monetary figure. Every dollar amount in the brief is formatted in
// TypeScript directly from a row this file read out of SQLite. If a value is
// not in the DB, the brief says "unknown" — it does not guess. The LLM is used
// only for the qualitative "how to earn more" paragraph, and its output is run
// through a numeric allow-list guard before it is allowed near the email.
//
// A forecast is not money. Projected earnings, run-rates and per-click value
// assumptions are never reported as earnings; where a reference rate is used to
// justify a suggestion it is labelled as an assumption, not a figure.
// ---------------------------------------------------------------------------

// ---- settings keys (all persisted so the NEXT run can diff against them) ----
export const SETTING_KEYS = {
  baselineAt:        'revenue_agent_baseline_at',
  lastRunAt:         'revenue_agent_last_run_at',
  lastBalanceUsd:    'revenue_agent_last_tp_balance_usd',
  lastCommissionN:   'revenue_agent_last_commission_count',
  lastCommissionSum: 'revenue_agent_last_commission_sum_usd',
  lastPaidSubs:      'revenue_agent_last_paid_subscribers',
  lastMrrUsd:        'revenue_agent_last_mrr_usd',
  lastAlertAt:       'revenue_agent_last_alert_at',
  /** Operator-tunable. Travelpayouts minimum payout; unverified — see docs. */
  payoutThreshold:   'revenue_agent_payout_threshold_usd',
} as const;

const DEFAULT_PAYOUT_THRESHOLD_USD = 50;

// Subscription prices. These are the list prices this agent is told to use;
// they are NOT read from Stripe. db.ts:adminMetrics() disagrees (it uses $49 for
// enterprise and ignores subscription_status entirely) — that query is the old
// phantom-MRR path and is deliberately not used here.
const PRICE_USD: Record<string, number> = { pro: 9, enterprise: 39 };

// Statuses that mean "this person is actually being billed".
const BILLED_STATUSES = ['active', 'trialing', 'past_due'] as const;

// Click-mix buckets, from the provider list in src/lib/affiliate.ts.
const HOTEL_PROVIDERS  = ['hotellook', 'booking', 'expedia'];
const ATTACH_PROVIDERS = ['ekta', 'kiwitaxi'];
const FLIGHT_PROVIDERS = [
  'aviasales', 'aviasales-tpk', 'wayaway', 'tripcom', 'skyscanner',
  'kayak', 'momondo', 'google', 'egyptair',
];

// Reference assumptions used ONLY to justify a recommendation. Never multiplied
// into a reported dollar figure. Source: Travelpayouts programme terms as
// recorded in src/lib/affiliate.ts comments — not a DB read.
const REFERENCE = {
  hotelUsdPerClick:  0.55,
  flightUsdPerClick: 0.10,
  ektaPremiumPctLow: 20,
  ektaPremiumPctHigh: 25,
  kiwitaxiRevSharePct: 50,
} as const;

// ---------------------------------------------------------------------------
// Reads — pure SQL, no model anywhere near this section.
// ---------------------------------------------------------------------------

type Balance = {
  usd: number | null;          // null === unknown, NEVER coerced to 0
  updatedAt: string | null;
  error: string | null;
  stale: boolean;
};

function readBalance(): Balance {
  const raw = (queries.getSetting('tp_balance_usd') ?? '').trim();
  const updatedAt = (queries.getSetting('tp_balance_updated_at') ?? '').trim() || null;
  const errRaw = (queries.getSetting('tp_balance_error') ?? '').trim();
  const error = errRaw.length ? errRaw : null;
  // pullCommissions() writes String(n) on success and leaves the key absent
  // before it has ever succeeded. Empty / unparseable => unknown, not zero.
  const n = raw.length ? Number(raw) : NaN;
  const usd = Number.isFinite(n) ? n : null;
  return { usd, updatedAt, error, stale: Boolean(error) };
}

/**
 * All-time commission totals. Deliberately NOT the 30d rolling windows in
 * db.ts — those shrink as rows age out, which a naive diff would read as money
 * disappearing. The diff must be monotonic, so it runs on all-time counters.
 */
function readCommissionsAllTime(): { count: number; sumUsd: number } {
  const r = getDb().prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount_usd), 0) AS s FROM commission_events`
  ).get() as { n: number; s: number };
  return { count: r.n, sumUsd: r.s };
}

function readCommissionsByPartnerAllTime(): Array<{ partner: string; bookings: number; revenue_usd: number }> {
  return getDb().prepare(
    `SELECT partner, COUNT(*) AS bookings, COALESCE(SUM(amount_usd), 0) AS revenue_usd
       FROM commission_events
      GROUP BY partner
      ORDER BY revenue_usd DESC`
  ).all() as Array<{ partner: string; bookings: number; revenue_usd: number }>;
}

/** Newest commission rows, so the brief can name what actually landed. */
function readRecentCommissions(limit = 10): Array<{
  partner: string; amount_usd: number; booking_id: string | null;
  received_at: string; provider: string | null; surface: string | null;
}> {
  return getDb().prepare(
    `SELECT ce.partner, ce.amount_usd, ce.booking_id, ce.received_at,
            ac.provider AS provider, ac.surface AS surface
       FROM commission_events ce
       LEFT JOIN affiliate_clicks ac ON ac.token = ce.click_token
      ORDER BY ce.received_at DESC
      LIMIT ?`
  ).all(limit) as Array<{
    partner: string; amount_usd: number; booking_id: string | null;
    received_at: string; provider: string | null; surface: string | null;
  }>;
}

/**
 * Which surfaces have ever actually converted. Joins commission_events back to
 * the originating click. With zero commission rows this returns [] and the
 * brief must say "no conversions recorded" — it must not name a winner.
 */
function readConvertedSurfaces(): Array<{ surface: string; provider: string; bookings: number; revenue_usd: number }> {
  return getDb().prepare(
    `SELECT COALESCE(ac.surface, 'untagged')  AS surface,
            COALESCE(ac.provider, 'unknown')  AS provider,
            COUNT(*)                          AS bookings,
            COALESCE(SUM(ce.amount_usd), 0)   AS revenue_usd
       FROM commission_events ce
       JOIN affiliate_clicks ac ON ac.token = ce.click_token
      GROUP BY surface, provider
      ORDER BY revenue_usd DESC`
  ).all() as Array<{ surface: string; provider: string; bookings: number; revenue_usd: number }>;
}

type Subscribers = {
  ownerEmail: string | null;
  ownerExcluded: boolean;
  byTier: Array<{ tier: string; count: number }>;
  billedCount: number;
  mrrUsd: number | null;      // null === refused to compute (no OWNER_EMAIL)
  unpricedTiers: string[];    // billed tiers with no known list price
};

/**
 * Billed subscribers, OWNER EXCLUDED.
 *
 * The owner is a comp account. Counting him produced phantom MRR once already;
 * that bug is not coming back. If OWNER_EMAIL is unset we cannot exclude him,
 * so we refuse to report MRR at all rather than report a number we know may be
 * inflated. (OWNER_EMAIL is read from env directly rather than via
 * src/lib/auth.ts#ownerEmail() because auth.ts imports next/headers, which the
 * standalone scripts/run-job.mjs runner does not provide.)
 */
function readSubscribers(): Subscribers {
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const placeholders = BILLED_STATUSES.map(() => '?').join(',');
  const rows = getDb().prepare(
    `SELECT COALESCE(tier, 'free') AS tier, COUNT(*) AS count
       FROM users
      WHERE LOWER(COALESCE(subscription_status, '')) IN (${placeholders})
        AND (? = '' OR LOWER(COALESCE(email, '')) <> ?)
      GROUP BY tier
      ORDER BY count DESC`
  ).all(...BILLED_STATUSES, owner, owner) as Array<{ tier: string; count: number }>;

  const billedCount = rows.reduce((a, r) => a + r.count, 0);
  const unpriced = rows.filter(r => !(r.tier in PRICE_USD) && r.count > 0).map(r => r.tier);
  const mrr = owner
    ? rows.reduce((a, r) => a + (PRICE_USD[r.tier] ?? 0) * r.count, 0)
    : null;

  return {
    ownerEmail: owner || null,
    ownerExcluded: Boolean(owner),
    byTier: rows,
    billedCount,
    mrrUsd: mrr,
    unpricedTiers: unpriced,
  };
}

type ClickMix = {
  byProvider30d: Array<{ provider: string; clicks: number }>;
  bySurface30d: Array<{ surface: string; clicks: number }>;
  total30d: number;
  hotel30d: number;
  flight30d: number;
  attach30d: number;
  other30d: number;
  hotelPct: number | null;
  flightPct: number | null;
  attachPct: number | null;
  ektaClicks30d: number;
  kiwitaxiClicks30d: number;
};

function readClickMix(): ClickMix {
  const byProvider30d = queries.clicksByProvider30d();
  const bySurface30d = queries.clicksBySurface30d();
  const sum = (list: string[]) =>
    byProvider30d.filter(r => list.includes(r.provider)).reduce((a, r) => a + r.clicks, 0);

  const total = byProvider30d.reduce((a, r) => a + r.clicks, 0);
  const hotel = sum(HOTEL_PROVIDERS);
  const flight = sum(FLIGHT_PROVIDERS);
  const attach = sum(ATTACH_PROVIDERS);
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : null);

  return {
    byProvider30d,
    bySurface30d,
    total30d: total,
    hotel30d: hotel,
    flight30d: flight,
    attach30d: attach,
    other30d: total - hotel - flight - attach,
    hotelPct: pct(hotel),
    flightPct: pct(flight),
    attachPct: pct(attach),
    ektaClicks30d: byProvider30d.find(r => r.provider === 'ekta')?.clicks ?? 0,
    kiwitaxiClicks30d: byProvider30d.find(r => r.provider === 'kiwitaxi')?.clicks ?? 0,
  };
}

export type RevenueFacts = {
  at: string;
  balance: Balance;
  commissions: { count: number; sumUsd: number };
  commissionsByPartner: Array<{ partner: string; bookings: number; revenue_usd: number }>;
  commissions30d: Array<{ partner: string; bookings: number; revenue_usd: number }>;
  recentCommissions: ReturnType<typeof readRecentCommissions>;
  convertedSurfaces: ReturnType<typeof readConvertedSurfaces>;
  subscribers: Subscribers;
  clicks: ClickMix;
  payoutThresholdUsd: number;
};

export function collectRevenueFacts(): RevenueFacts {
  const thresholdRaw = Number((queries.getSetting(SETTING_KEYS.payoutThreshold) ?? '').trim());
  return {
    at: new Date().toISOString(),
    balance: readBalance(),
    commissions: readCommissionsAllTime(),
    commissionsByPartner: readCommissionsByPartnerAllTime(),
    commissions30d: queries.commissionsByPartner30d(),
    recentCommissions: readRecentCommissions(),
    convertedSurfaces: readConvertedSurfaces(),
    subscribers: readSubscribers(),
    clicks: readClickMix(),
    payoutThresholdUsd: Number.isFinite(thresholdRaw) && thresholdRaw > 0
      ? thresholdRaw
      : DEFAULT_PAYOUT_THRESHOLD_USD,
  };
}

// ---------------------------------------------------------------------------
// Diff against the last run.
// ---------------------------------------------------------------------------

type Prev = {
  seen: boolean;                 // false === first ever run
  balanceUsd: number | null;
  commissionCount: number | null;
  commissionSumUsd: number | null;
  paidSubs: number | null;
  mrrUsd: number | null;
  lastRunAt: string | null;
};

function num(key: string): number | null {
  const raw = (queries.getSetting(key) ?? '').trim();
  if (!raw.length) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function readPrev(): Prev {
  return {
    seen: Boolean((queries.getSetting(SETTING_KEYS.baselineAt) ?? '').trim()),
    balanceUsd: num(SETTING_KEYS.lastBalanceUsd),
    commissionCount: num(SETTING_KEYS.lastCommissionN),
    commissionSumUsd: num(SETTING_KEYS.lastCommissionSum),
    paidSubs: num(SETTING_KEYS.lastPaidSubs),
    mrrUsd: num(SETTING_KEYS.lastMrrUsd),
    lastRunAt: (queries.getSetting(SETTING_KEYS.lastRunAt) ?? '').trim() || null,
  };
}

function persist(f: RevenueFacts): void {
  if (f.balance.usd !== null && !f.balance.stale) {
    queries.setSetting(SETTING_KEYS.lastBalanceUsd, String(f.balance.usd));
  }
  queries.setSetting(SETTING_KEYS.lastCommissionN, String(f.commissions.count));
  queries.setSetting(SETTING_KEYS.lastCommissionSum, String(f.commissions.sumUsd));
  queries.setSetting(SETTING_KEYS.lastPaidSubs, String(f.subscribers.billedCount));
  if (f.subscribers.mrrUsd !== null) {
    queries.setSetting(SETTING_KEYS.lastMrrUsd, String(f.subscribers.mrrUsd));
  }
  queries.setSetting(SETTING_KEYS.lastRunAt, f.at);
  if (!(queries.getSetting(SETTING_KEYS.baselineAt) ?? '').trim()) {
    queries.setSetting(SETTING_KEYS.baselineAt, f.at);
  }
}

type Delta = {
  firstRun: boolean;
  triggers: string[];
  newCommissionCount: number;
  /** null === we know rows arrived but cannot say how much (no prior stored sum). */
  newCommissionUsd: number | null;
  balanceDeltaUsd: number | null;
  subsDelta: number | null;
  mrrDeltaUsd: number | null;
  crossedPayoutThreshold: boolean;
};

function diff(f: RevenueFacts, p: Prev): Delta {
  const triggers: string[] = [];
  const d: Delta = {
    firstRun: !p.seen,
    triggers,
    newCommissionCount: 0,
    newCommissionUsd: null,
    balanceDeltaUsd: null,
    subsDelta: null,
    mrrDeltaUsd: null,
    crossedPayoutThreshold: false,
  };
  // First run establishes the baseline and stays silent. Pre-existing figures
  // are NOT "new money since last run".
  if (!p.seen) return d;

  if (p.commissionCount !== null && f.commissions.count > p.commissionCount) {
    d.newCommissionCount = f.commissions.count - p.commissionCount;
    // Never default the prior sum to 0 — that would report the ENTIRE all-time
    // total as "new money". Missing prior sum => amount unknown, not $0.
    d.newCommissionUsd = p.commissionSumUsd === null
      ? null
      : round2(f.commissions.sumUsd - p.commissionSumUsd);
    triggers.push('new-commission');
  }

  // Only a KNOWN, FRESH balance can move. A stale or unknown balance never
  // fires an alert and never overwrites the stored baseline.
  if (f.balance.usd !== null && !f.balance.stale && p.balanceUsd !== null) {
    const delta = round2(f.balance.usd - p.balanceUsd);
    d.balanceDeltaUsd = delta;
    if (delta > 0.005) triggers.push('balance-up');
    if (f.balance.usd >= f.payoutThresholdUsd && p.balanceUsd < f.payoutThresholdUsd) {
      d.crossedPayoutThreshold = true;
      triggers.push('payout-threshold');
    }
  }

  if (p.paidSubs !== null && f.subscribers.billedCount !== p.paidSubs) {
    d.subsDelta = f.subscribers.billedCount - p.paidSubs;
    triggers.push(d.subsDelta > 0 ? 'subscriber-gained' : 'subscriber-lost');
  }
  if (p.mrrUsd !== null && f.subscribers.mrrUsd !== null && f.subscribers.mrrUsd !== p.mrrUsd) {
    d.mrrDeltaUsd = round2(f.subscribers.mrrUsd - p.mrrUsd);
  }

  return d;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Whole dollars, no decimals, per BRAND_VOICE. Unknown is never rendered as $0. */
function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'unknown';
  return `$${(Math.round(n * 100) / 100).toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// ---------------------------------------------------------------------------
// Numeric guard — the actual anti-fabrication mechanism.
// ---------------------------------------------------------------------------

function normalizeNum(tok: string): string {
  const n = Number(tok.replace(/,/g, ''));
  return Number.isFinite(n) ? String(n) : tok;
}

/** Every number this agent is willing to see in model-written prose. */
export function buildNumberAllowlist(f: RevenueFacts): Set<string> {
  const out = new Set<string>();
  const add = (n: number | null | undefined) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return;
    out.add(String(n));
    out.add(String(Math.round(n)));
    out.add(String(round2(n)));
  };
  add(f.balance.usd);
  add(f.commissions.count);
  add(f.commissions.sumUsd);
  add(f.subscribers.billedCount);
  add(f.subscribers.mrrUsd);
  add(f.payoutThresholdUsd);
  add(f.clicks.total30d);
  add(f.clicks.hotel30d); add(f.clicks.flight30d); add(f.clicks.attach30d); add(f.clicks.other30d);
  add(f.clicks.hotelPct); add(f.clicks.flightPct); add(f.clicks.attachPct);
  add(f.clicks.ektaClicks30d); add(f.clicks.kiwitaxiClicks30d);
  for (const r of f.clicks.byProvider30d) add(r.clicks);
  for (const r of f.clicks.bySurface30d) add(r.clicks);
  for (const r of f.commissionsByPartner) { add(r.bookings); add(r.revenue_usd); }
  for (const r of f.commissions30d) { add(r.bookings); add(r.revenue_usd); }
  for (const r of f.convertedSurfaces) { add(r.bookings); add(r.revenue_usd); }
  for (const r of f.subscribers.byTier) add(r.count);
  for (const r of f.recentCommissions) add(r.amount_usd);
  for (const v of Object.values(PRICE_USD)) add(v);
  for (const v of Object.values(REFERENCE)) add(v);
  add(30); // the "last 30 days" window the prose is allowed to name
  return out;
}

/**
 * Returns the numeric tokens in `text` that are NOT in the allow-list. A
 * non-empty result means the model produced a figure we cannot point at in the
 * database, and the prose must be discarded.
 */
export function ungroundedNumbers(text: string, allowed: Set<string>): string[] {
  const toks = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return [...new Set(toks.map(normalizeNum).filter(t => !allowed.has(t)))];
}

// ---------------------------------------------------------------------------
// Brief assembly — all money formatted here, in TypeScript.
// ---------------------------------------------------------------------------

function moneySection(f: RevenueFacts, d: Delta, unknowns: string[]): string {
  const lines: string[] = [];

  // Balance.
  if (f.balance.usd === null) {
    lines.push('Travelpayouts balance: unknown — no successful balance read has ever been recorded (settings key tp_balance_usd is unset).');
    unknowns.push('tp_balance_usd unset — balance unknown');
  } else if (f.balance.stale) {
    lines.push(`Travelpayouts balance: last known ${usd(f.balance.usd)} as of ${f.balance.updatedAt ?? 'an unrecorded time'} — STALE, the last pull failed (${f.balance.error}). Treat as last-known, not current.`);
    unknowns.push(`tp_balance_error set (${f.balance.error}) — balance is stale`);
  } else {
    const move = d.balanceDeltaUsd === null
      ? ' (no prior figure to compare against)'
      : d.balanceDeltaUsd === 0 ? ' (unchanged since last run)'
      : d.balanceDeltaUsd > 0 ? ` (up ${usd(d.balanceDeltaUsd)} since last run)`
      : ` (down ${usd(Math.abs(d.balanceDeltaUsd))} since last run)`;
    lines.push(`Travelpayouts balance: ${usd(f.balance.usd)} as of ${f.balance.updatedAt ?? 'unrecorded'}${move}.`);
  }
  if (d.crossedPayoutThreshold) {
    lines.push(`Payout threshold reached: balance crossed ${usd(f.payoutThresholdUsd)}.`);
  }

  // Commissions.
  if (f.commissions.count === 0) {
    lines.push('Commission events: 0 rows all-time in commission_events. No affiliate booking has ever been confirmed to us. Zero, not unknown.');
  } else {
    lines.push(`Commission events: ${f.commissions.count} all-time totalling ${usd(f.commissions.sumUsd)}.`);
    const byP = f.commissionsByPartner.map(r => `${r.partner} ${r.bookings}×${usd(r.revenue_usd)}`).join('; ');
    lines.push(`By partner (all-time): ${byP}.`);
  }
  if (d.newCommissionCount > 0) {
    if (d.newCommissionUsd === null) {
      lines.push(`NEW since last run: ${d.newCommissionCount} commission event(s). Dollar amount UNKNOWN — no prior stored sum (${SETTING_KEYS.lastCommissionSum}) to diff against, so the amount is not being guessed.`);
      unknowns.push(`${SETTING_KEYS.lastCommissionSum} missing — value of new commissions not computable`);
    } else {
      lines.push(`NEW since last run: ${d.newCommissionCount} commission event(s) worth ${usd(d.newCommissionUsd)}.`);
    }
    const shown = Math.min(d.newCommissionCount, f.recentCommissions.length);
    if (shown < d.newCommissionCount) {
      lines.push(`  (showing the ${shown} most recent of ${d.newCommissionCount})`);
    }
    for (const r of f.recentCommissions.slice(0, shown)) {
      lines.push(`  · ${r.partner} ${usd(r.amount_usd)} on ${r.received_at}` +
        ` — click provider ${r.provider ?? 'unattributed'}, surface ${r.surface ?? 'unattributed'}` +
        `${r.booking_id ? `, booking ${r.booking_id}` : ''}.`);
    }
  }

  // Subscriptions.
  const s = f.subscribers;
  const tierStr = s.byTier.length
    ? s.byTier.map(r => `${r.count}× ${r.tier}`).join(', ')
    : 'none';
  if (!s.ownerExcluded) {
    lines.push(`Billed subscribers: ${s.billedCount} (${tierStr}) with status in ${BILLED_STATUSES.join('/')}. MRR NOT REPORTED — OWNER_EMAIL is unset, so the comp owner account could not be excluded and any MRR figure would be inflated.`);
    unknowns.push('OWNER_EMAIL unset — owner could not be excluded, MRR withheld');
  } else {
    lines.push(`Billed subscribers (owner ${s.ownerEmail} excluded as a comp account): ${s.billedCount} (${tierStr}). MRR ${usd(s.mrrUsd)} at list prices pro ${usd(PRICE_USD.pro)}/mo, enterprise ${usd(PRICE_USD.enterprise)}/mo.`);
  }
  if (s.unpricedTiers.length) {
    lines.push(`Tiers with billed users but no known list price, counted as $0 toward MRR: ${s.unpricedTiers.join(', ')}. MRR is therefore a floor, not a total.`);
    unknowns.push(`unpriced billed tiers: ${s.unpricedTiers.join(', ')}`);
  }
  if (d.subsDelta !== null && d.subsDelta !== 0) {
    lines.push(`Subscriber change since last run: ${d.subsDelta > 0 ? '+' : ''}${d.subsDelta}` +
      (d.mrrDeltaUsd !== null ? ` (MRR ${d.mrrDeltaUsd > 0 ? '+' : '-'}${usd(Math.abs(d.mrrDeltaUsd))})` : '') + '.');
  }

  return lines.join('\n');
}

function earnMoreFacts(f: RevenueFacts): string {
  const c = f.clicks;
  const lines: string[] = [];
  if (c.total30d === 0) {
    lines.push('Affiliate clicks, last 30 days: 0. There is no click data to reason about — nothing is being clicked, so no mix-shift or attach-brand suggestion can be grounded yet.');
    return lines.join('\n');
  }
  lines.push(`Affiliate clicks, last 30 days: ${c.total30d} total.`);
  lines.push(`By provider: ${c.byProvider30d.map(r => `${r.provider} ${r.clicks}`).join(', ')}.`);
  lines.push(`By surface: ${c.bySurface30d.map(r => `${r.surface} ${r.clicks}`).join(', ')}.`);
  lines.push(`Mix: hotels ${c.hotel30d} (${c.hotelPct}%), flights ${c.flight30d} (${c.flightPct}%), attach brands ${c.attach30d} (${c.attachPct}%), other ${c.other30d}.`);
  lines.push(`High-value attach brands: ekta ${c.ektaClicks30d} clicks, kiwitaxi ${c.kiwitaxiClicks30d} clicks in the last 30 days.`);
  if (f.convertedSurfaces.length === 0) {
    lines.push('Surfaces that converted: none — no commission_events row joins back to an affiliate_clicks token, so no surface can be credited with a booking.');
  } else {
    lines.push(`Surfaces that converted: ${f.convertedSurfaces.map(r => `${r.surface}/${r.provider} ${r.bookings} booking(s) ${usd(r.revenue_usd)}`).join('; ')}.`);
  }
  lines.push(`Reference rates (programme terms, NOT a DB read and NOT earnings): hotel clicks are worth about $${REFERENCE.hotelUsdPerClick} each versus about $${REFERENCE.flightUsdPerClick} for flight clicks; EKTA pays ${REFERENCE.ektaPremiumPctLow}-${REFERENCE.ektaPremiumPctHigh}% of the insurance premium and Kiwitaxi a ${REFERENCE.kiwitaxiRevSharePct}% revenue share.`);
  return lines.join('\n');
}

/** Deterministic fallback advice — used when the model is unavailable or guarded off. */
function deterministicAdvice(f: RevenueFacts): string {
  const c = f.clicks;
  const out: string[] = [];
  if (c.total30d === 0) {
    out.push('No clicks in 30 days, so the only lever that can be grounded in data is getting traffic onto a booking surface at all.');
    return out.join(' ');
  }
  if (c.attach30d === 0) {
    out.push(`Attach brands got ${c.attach30d} clicks in 30 days out of ${c.total30d} — ekta and kiwitaxi are effectively not being surfaced. They are the highest-rate products in the account.`);
  } else {
    out.push(`Attach brands got ${c.attach30d} of ${c.total30d} clicks (${c.attachPct}%).`);
  }
  if (c.hotelPct !== null && c.flightPct !== null) {
    out.push(`The click mix is ${c.flightPct}% flights against ${c.hotelPct}% hotels; hotel clicks carry the higher reference rate, so shifting that mix is the largest per-click lever available.`);
  }
  const topSurface = c.bySurface30d[0];
  if (topSurface) {
    out.push(`The heaviest surface is ${topSurface.surface} at ${topSurface.clicks} clicks — that is where an attach or hotel placement would reach the most people.`);
  }
  if (f.convertedSurfaces.length === 0) {
    out.push('Nothing has converted yet, so no surface can be called a winner; the priority is attribution reaching commission_events at all.');
  }
  return out.join(' ');
}

function buildAdvicePrompt(f: RevenueFacts): string {
  return [
    'Write 3-5 sentences of concrete "how to earn more" advice for the FlyCheap founder.',
    'You may ONLY use the numbers listed below. Do not compute, estimate, project, extrapolate,',
    'annualise or otherwise produce any number that is not literally present below.',
    'Do not state projected or potential earnings in dollars. No headers, no bullets.',
    '',
    'REAL DATA (the only numbers you may use):',
    earnMoreFacts(f),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

export async function runRevenue(): Promise<RevenueResult> {
  // DRY_RUN semantics copied from the insights agent: it gates PUBLIC
  // broadcasting, which this agent never does. The owner brief and the
  // revenue_agent_* bookkeeping happen either way — otherwise a DRY_RUN run
  // would re-alert on the same money forever.
  const dryRun = isDryRun();
  const model = MODELS.revenue;
  const runId = startRun('revenue', model, dryRun);
  const startMs = Date.now();

  try {
    const facts = collectRevenueFacts();
    const prev = readPrev();
    const delta = diff(facts, prev);
    const unknowns: string[] = [];

    const money = moneySection(facts, delta, unknowns);

    // Qualitative prose only, and only if a key is configured. Unlike insights,
    // a missing key is NOT fatal here — the money numbers are the deliverable
    // and they are computed without any model at all.
    let advice = deterministicAdvice(facts);
    let guardTripped = false;
    if (hasApiKey()) {
      try {
        if (!(await pingModel(model))) throw new Error(`model ping failed: ${model}`);
        const draft = await complete({
          model,
          system: `${BRAND_VOICE}\n\nYou are an affiliate-revenue analyst. You NEVER invent, estimate or forecast a number. Only numbers given to you may appear in your output.`,
          user: buildAdvicePrompt(facts),
          maxTokens: 500,
        });
        const bad = ungroundedNumbers(draft, buildNumberAllowlist(facts));
        if (bad.length) {
          guardTripped = true;
          unknowns.push(`model advice discarded — ungrounded numbers: ${bad.join(', ')}`);
          queries.insertAudit({
            user_id: null, email: null, action: 'revenue_agent.guard_tripped',
            entity: 'agent:revenue', detail: { runId, ungrounded: bad }, ip: null,
          });
        } else {
          advice = draft;
        }
      } catch (e) {
        unknowns.push(`model unavailable, using deterministic advice: ${(e as Error).message}`);
      }
    } else {
      unknowns.push('ANTHROPIC_API_KEY not set — deterministic advice used');
    }

    const to = (process.env.AGENT_ADMIN_EMAIL ?? '').trim();
    if (!to && delta.triggers.length > 0) {
      unknowns.push('AGENT_ADMIN_EMAIL not set — alert could not be delivered');
    }

    const today = new Date().toISOString().slice(0, 10);
    const brief = [
      delta.firstRun
        ? 'BASELINE RUN — the revenue agent had no stored figures, so nothing below is "new money". These numbers are simply the current state; the next run will diff against them.'
        : `Money check against the last run${prev.lastRunAt ? ` (${prev.lastRunAt})` : ''}.`,
      '',
      'REAL MONEY',
      money,
      '',
      'HOW TO EARN MORE',
      earnMoreFacts(facts),
      '',
      advice,
      '',
      unknowns.length ? `NOT KNOWN (stated rather than guessed):\n${unknowns.map(u => `· ${u}`).join('\n')}` : 'No unknowns this run.',
      '',
      'Every dollar figure above was read from SQLite (settings.tp_balance_usd, commission_events, users). Reference per-click rates and partner percentages are programme terms, not earnings, and are never multiplied into a reported figure.',
    ].join('\n');

    // Persist AFTER the diff so the next run has a baseline. Always — including
    // DRY_RUN and including silent runs.
    persist(facts);

    // ---- alert rules: email only when something material actually changed ----
    let emailed = false;
    let emailNote = '';
    if (delta.triggers.length === 0) {
      emailNote = delta.firstRun
        ? 'first run — baseline stored, intentionally silent'
        : 'nothing material changed — intentionally silent';
    } else if (!to) {
      emailNote = `AGENT_ADMIN_EMAIL not set — ${delta.triggers.join('/')} detected but not emailed`;
    } else {
      const subject = `FlyCheap revenue — ${delta.triggers.join(', ')} — ${today}`;
      const res = await sendOperatorBrief({ to, subject, body: brief });
      emailed = res.ok;
      emailNote = res.ok ? `emailed to ${to} (id=${res.id})` : `email failed: ${res.error}`;
      if (res.ok) queries.setSetting(SETTING_KEYS.lastAlertAt, facts.at);
    }

    queries.insertAudit({
      user_id: null, email: null, action: 'revenue_agent.run',
      entity: 'agent:revenue',
      detail: {
        runId, dryRun, triggers: delta.triggers, emailed,
        balanceUsd: facts.balance.usd, balanceStale: facts.balance.stale,
        commissionCount: facts.commissions.count, commissionSumUsd: facts.commissions.sumUsd,
        billedSubscribers: facts.subscribers.billedCount, mrrUsd: facts.subscribers.mrrUsd,
      },
      ip: null,
    });

    finishRun(runId, {
      ok: true,
      durationMs: Date.now() - startMs,
      summary: `triggers=${delta.triggers.join('|') || 'none'} · ${emailNote} · guard=${guardTripped ? 'TRIPPED' : 'ok'} · DRY_RUN=${dryRun}`,
      output: { brief, facts, delta, unknowns, emailed, emailTo: to || null },
    });

    return {
      runId, model, dryRun, brief,
      triggers: delta.triggers,
      unknowns,
      emailed,
      emailTo: to || null,
      adviceGuardTripped: guardTripped,
    };
  } catch (e) {
    finishRun(runId, { ok: false, durationMs: Date.now() - startMs, error: (e as Error).message });
    throw e;
  }
}

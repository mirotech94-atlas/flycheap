/**
 * The fare decision model — what the network looks at, what "right" means,
 * and how it learns from FlyCheap's own history.
 *
 * THE QUESTION IT ANSWERS
 *   "Given this route's recent prices and today's fare, will a cheaper fare
 *    show up in the next 7 days?"  Three answers, as probabilities:
 *      buy   — no, this is about as good as it gets: book it
 *      wait  — yes, and by enough to matter: hold off
 *      hold  — it's a coin flip: keep watching
 *
 * WHY 7 DAYS
 *   `verdict_calls` already scores every live verdict at 7 and 14 days
 *   against the lowest price that actually followed. Training on the same
 *   question the product is judged on means the accuracy number on
 *   /admin/trust and the model's own accuracy are the same number.
 *
 * WHERE THE TRAINING DATA COMES FROM
 *   Replaying history. For every route, at every day in its snapshot
 *   history that has at least 14 days before it and 7 days after it, we
 *   compute the same features the live verdict sees, then look at the 7 days
 *   that followed and record what actually happened. 24 routes × ~130 days
 *   gives a few thousand honest examples, each one a decision the product
 *   could have made and the answer it would have got.
 *
 * WHAT IT DOES NOT DO
 *   It never invents a number. The features are arithmetic over prices that
 *   were really polled; the label is a price that was really seen. And it
 *   does not replace the rules — see verdictBlend.ts for how the two are
 *   combined and when the network is allowed to disagree.
 */

import type { VerdictPoint } from '@/lib/verdict';
import { Network, fitScaler, applyScaler, type NetworkWeights, type Scaler } from './network';

export const FARE_MODEL_VERSION = 1;

export const CLASSES = ['buy', 'wait', 'hold'] as const;
export type FareClass = (typeof CLASSES)[number];

/** The horizon the label is measured over. Matches verdict_calls.correct_7d. */
export const HORIZON_DAYS = 7;
/** How far back the features look. Matches the 30-day window the rules use,
 *  with a lower floor so newer routes still get a model. */
export const LOOKBACK_DAYS = 30;
export const MIN_LOOKBACK_DAYS = 14;

/** A saving smaller than this is noise, not a reason to wait. */
export const MEANINGFUL_DROP_PCT = 3;

// ---- features ------------------------------------------------------------

/**
 * The inputs, in a fixed order. Each is a plain number the rules already
 * compute or could. Names are the documentation: if a feature is not obvious
 * from its name it should not be here.
 */
export const FEATURE_NAMES = [
  'positionInRange',     // 0–1: where today sits between the window's min and max
  'percentile',          // 0–1: share of the window at or below today's price
  'zScore',              // how many std devs today is from the window mean
  'trendPct',            // recent-half vs older-half change, in %
  'slopePctPerDay',      // least-squares slope as % of the mean, per day
  'volatilityPct',       // std dev as % of the mean
  'vsMedianPct',         // today vs the window median, in %
  'daysSinceMin',        // how long ago the window's low was
  'daysToDeparture',     // days from today to the outbound date (0 if unknown)
  'dayOfWeek',           // 0–6, Monday = 0
  'sampleDensity',       // snapshots per day in the window
] as const;

export type FeatureVector = number[];

export type FeatureInput = {
  /** Price points inside the lookback window, any order. */
  history: VerdictPoint[];
  currentPrice: number;
  /** ISO date of the moment the decision is made. */
  asOf: string;
  /** ISO date of the outbound flight, when known. */
  departDate?: string | null;
};

function dayIndex(iso: string): number { return new Date(iso).getTime() / 86_400_000; }

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Least-squares slope of price against day. */
function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den > 0 ? num / den : 0;
}

/** Turn a decision moment into the network's inputs. Returns null when the
 *  history is too thin to say anything — the caller then keeps the rules. */
export function featurize(input: FeatureInput): FeatureVector | null {
  const asOfDay = dayIndex(input.asOf);
  const points = input.history
    .filter(h => Number.isFinite(h.price_per_adult_usd) && h.price_per_adult_usd > 0)
    .filter(h => { const d = asOfDay - dayIndex(h.polled_at); return d >= 0 && d <= LOOKBACK_DAYS; })
    .sort((a, b) => a.polled_at.localeCompare(b.polled_at));
  if (points.length < 4) return null;
  const spanDays = asOfDay - dayIndex(points[0].polled_at);
  if (spanDays < MIN_LOOKBACK_DAYS) return null;

  const prices = points.map(p => p.price_per_adult_usd);
  const sorted = [...prices].sort((a, b) => a - b);
  const n = prices.length;
  const min = sorted[0], max = sorted[n - 1];
  const median = quantile(sorted, 0.5);
  const mean = prices.reduce((s, p) => s + p, 0) / n;
  const variance = n > 1 ? prices.reduce((s, p) => s + (p - mean) ** 2, 0) / (n - 1) : 0;
  const std = Math.sqrt(variance);
  const cur = input.currentPrice;

  const half = Math.floor(n / 2);
  const olderAvg = half ? prices.slice(0, half).reduce((s, p) => s + p, 0) / half : mean;
  const recentAvg = prices.slice(half).reduce((s, p) => s + p, 0) / (n - half);
  const days = points.map(p => dayIndex(p.polled_at) - asOfDay);
  const minIdx = prices.indexOf(min);
  const depart = input.departDate ? dayIndex(input.departDate) - asOfDay : 0;
  const dow = (new Date(input.asOf).getUTCDay() + 6) % 7;

  return [
    max > min ? (cur - min) / (max - min) : 0,
    sorted.filter(p => p <= cur).length / n,
    std > 0 ? (cur - mean) / std : 0,
    olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0,
    mean > 0 ? (slope(days, prices) / mean) * 100 : 0,
    mean > 0 ? (std / mean) * 100 : 0,
    median > 0 ? ((cur - median) / median) * 100 : 0,
    -days[minIdx],
    Math.max(0, Math.min(365, depart)),
    dow,
    n / Math.max(1, spanDays),
  ];
}

// ---- labels --------------------------------------------------------------

/**
 * What actually happened. `minAfter` is the lowest price seen in the
 * HORIZON_DAYS after the decision (the same number verdict_calls records).
 *   wait  — a drop of at least MEANINGFUL_DROP_PCT followed
 *   buy   — nothing cheaper followed at all (within 1%, so a $2 wobble on a
 *           $900 fare does not count against a correct buy)
 *   hold  — something cheaper appeared, but not by enough to have mattered
 */
export function labelFor(priceAtCall: number, minAfter: number | null): FareClass | null {
  if (minAfter == null || !Number.isFinite(minAfter) || priceAtCall <= 0) return null;
  const dropPct = ((priceAtCall - minAfter) / priceAtCall) * 100;
  if (dropPct >= MEANINGFUL_DROP_PCT) return 'wait';
  if (dropPct <= 1) return 'buy';
  return 'hold';
}

export function oneHot(c: FareClass): number[] {
  return CLASSES.map(k => (k === c ? 1 : 0));
}

// ---- the model -----------------------------------------------------------

export type FareModel = {
  version: number;
  trainedAt: string;
  featureNames: readonly string[];
  scaler: Scaler;
  network: NetworkWeights;
  /** Held-out accuracy and the rules' accuracy on the same examples, so the
   *  admin page can show whether the model is earning its place. */
  metrics: {
    trainExamples: number;
    testExamples: number;
    testAccuracy: number;
    rulesAccuracyOnTest: number;
    /** Per-class precision on the test split. */
    perClass: Record<FareClass, { precision: number; recall: number; support: number }>;
    epochs: number;
    finalLoss: number;
  };
};

export type Example = {
  features: FeatureVector;
  label: FareClass;
  /** What the existing rules said at that moment, for the comparison. */
  rulesVerdict: FareClass | null;
  route: string;
  asOf: string;
};

export type TrainOptions = {
  epochs?: number;
  learningRate?: number;
  batchSize?: number;
  /** Share of ROUTES (not rows) held out for the honesty check. Splitting by
   *  route means the test score reflects routes the model never saw, which is
   *  the situation every new watch is in. */
  testShare?: number;
  seed?: number;
};

export function trainFareModel(examples: Example[], opts: TrainOptions = {}): FareModel {
  const epochs = opts.epochs ?? 200;
  const lr = opts.learningRate ?? 0.05;
  const batchSize = opts.batchSize ?? 32;
  const seed = opts.seed ?? 7;
  if (examples.length < 50) throw new Error(`not enough examples to train (${examples.length}; need 50)`);

  // Route-level split.
  const routes = [...new Set(examples.map(e => e.route))];
  const rnd = mulberry(seed);
  const shuffledRoutes = [...routes].sort(() => rnd() - 0.5);
  const nTest = Math.max(1, Math.round(shuffledRoutes.length * (opts.testShare ?? 0.25)));
  const testRoutes = new Set(shuffledRoutes.slice(0, nTest));
  const train = examples.filter(e => !testRoutes.has(e.route));
  const test = examples.filter(e => testRoutes.has(e.route));

  const scaler = fitScaler(train.map(e => e.features));
  const X = train.map(e => applyScaler(scaler, e.features));
  const Y = train.map(e => oneHot(e.label));

  // Class weights: "hold" is usually the majority. Without weighting the
  // network learns to say hold for everything and scores well on nothing
  // that matters. Weight each class inversely to its frequency.
  const counts = CLASSES.map(c => train.filter(e => e.label === c).length || 1);
  const weights = counts.map(c => train.length / (CLASSES.length * c));
  const W = train.map(e => weights[CLASSES.indexOf(e.label)]);

  const net = new Network({
    inputs: FEATURE_NAMES.length,
    layers: [
      { size: 16, activation: 'relu' },
      { size: 8, activation: 'relu' },
      { size: CLASSES.length, activation: 'softmax' },
    ],
  }, seed);

  let loss = 0;
  const order = X.map((_, i) => i);
  for (let ep = 0; ep < epochs; ep++) {
    order.sort(() => rnd() - 0.5);
    let epLoss = 0, batches = 0;
    for (let b = 0; b < order.length; b += batchSize) {
      const idx = order.slice(b, b + batchSize);
      epLoss += net.trainBatch(idx.map(i => X[i]), idx.map(i => Y[i]), lr * (1 - ep / epochs * 0.5), 1e-4, idx.map(i => W[i]));
      batches++;
    }
    loss = epLoss / Math.max(1, batches);
  }

  // Honesty check on routes the model never saw.
  const predictOn = (e: Example): FareClass => {
    const p = net.predict(applyScaler(scaler, e.features));
    return CLASSES[p.indexOf(Math.max(...p))];
  };
  const evalSet = test.length ? test : train;
  let right = 0, rulesRight = 0;
  const perClass = Object.fromEntries(CLASSES.map(c => [c, { tp: 0, fp: 0, fn: 0 }])) as Record<FareClass, { tp: number; fp: number; fn: number }>;
  for (const e of evalSet) {
    const p = predictOn(e);
    if (p === e.label) { right++; perClass[p].tp++; } else { perClass[p].fp++; perClass[e.label].fn++; }
    if (e.rulesVerdict === e.label) rulesRight++;
  }

  return {
    version: FARE_MODEL_VERSION,
    trainedAt: new Date().toISOString(),
    featureNames: FEATURE_NAMES,
    scaler,
    network: net.toWeights(),
    metrics: {
      trainExamples: train.length,
      testExamples: test.length,
      testAccuracy: evalSet.length ? right / evalSet.length : 0,
      rulesAccuracyOnTest: evalSet.length ? rulesRight / evalSet.length : 0,
      perClass: Object.fromEntries(CLASSES.map(c => {
        const m = perClass[c];
        return [c, {
          precision: m.tp + m.fp ? m.tp / (m.tp + m.fp) : 0,
          recall: m.tp + m.fn ? m.tp / (m.tp + m.fn) : 0,
          support: m.tp + m.fn,
        }];
      })) as FareModel['metrics']['perClass'],
      epochs,
      finalLoss: loss,
    },
  };
}

/** Probability per class for one decision moment. */
export function predictFare(model: FareModel, features: FeatureVector): Record<FareClass, number> {
  const net = Network.fromWeights(model.network);
  const p = net.predict(applyScaler(model.scaler, features));
  return Object.fromEntries(CLASSES.map((c, i) => [c, p[i]])) as Record<FareClass, number>;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

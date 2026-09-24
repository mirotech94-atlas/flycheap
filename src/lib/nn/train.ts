/**
 * Nightly training: replay every route's history, build the examples, train,
 * and store the model. Also the loader the app uses at decision time.
 *
 * The model lives in the `settings` table under `fare_model` as JSON — a few
 * kilobytes, read once per process and cached. A new model replaces the old
 * one only if it beats the rules on the held-out routes; otherwise the run
 * is logged and the previous model (or none) stays. That gate is what keeps
 * a bad night's training from making the product worse.
 */

import { getDb, queries } from '@/lib/db';
import { computeVerdict } from '@/lib/verdict';
import {
  featurize, labelFor, trainFareModel, HORIZON_DAYS, LOOKBACK_DAYS, MIN_LOOKBACK_DAYS,
  type Example, type FareModel, type FareClass,
} from './fareModel';

const MODEL_KEY = 'fare_model';
const LOG_KEY = 'fare_model_last_run';

type Snap = { polled_at: string; price_per_adult_usd: number };
type SearchRow = { id: number; origin: string; destination: string; depart_date: string | null };

/** Every snapshot for a search, oldest first, excluding fares verification
 *  ruled dead (a phantom low would teach the model to wait for prices that
 *  never existed). */
function snapshotsFor(searchId: number): Snap[] {
  return getDb().prepare(
    `SELECT polled_at, price_per_adult_usd FROM fare_snapshots
      WHERE search_id = ? AND price_per_adult_usd > 0
        AND COALESCE(verify_outcome, 'ok') <> 'dead'
      ORDER BY polled_at ASC`,
  ).all(searchId) as Snap[];
}

/**
 * Build the training set by replay. For each search, step through its
 * history one day at a time; at each day with enough history behind it and a
 * full horizon ahead, record the features, what the rules would have said,
 * and what actually happened next.
 */
export function buildExamples(): { examples: Example[]; searches: number; skipped: number } {
  const searches = getDb().prepare(
    `SELECT id, origin, destination, depart_date FROM searches`,
  ).all() as SearchRow[];
  const examples: Example[] = [];
  let used = 0, skipped = 0;

  for (const s of searches) {
    const snaps = snapshotsFor(s.id);
    if (snaps.length < 20) { skipped++; continue; }
    const route = `${s.origin}-${s.destination}`;
    const firstDay = snaps[0].polled_at.slice(0, 10);
    const lastDay = snaps[snaps.length - 1].polled_at.slice(0, 10);
    let made = 0;

    // Walk day by day from the first day that has MIN_LOOKBACK behind it to
    // the last day that has a full HORIZON ahead of it.
    for (let d = new Date(firstDay + 'T00:00:00Z'); ; d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      if (day > lastDay) break;
      const asOf = day + 'T12:00:00Z';
      const asOfMs = Date.parse(asOf);
      const backMs = asOfMs - LOOKBACK_DAYS * 86_400_000;
      const fwdMs = asOfMs + HORIZON_DAYS * 86_400_000;
      if (asOfMs - Date.parse(snaps[0].polled_at) < MIN_LOOKBACK_DAYS * 86_400_000) continue;
      if (Date.parse(snaps[snaps.length - 1].polled_at) < fwdMs) break;

      const window = snaps.filter(p => { const t = Date.parse(p.polled_at); return t >= backMs && t <= asOfMs; });
      const after = snaps.filter(p => { const t = Date.parse(p.polled_at); return t > asOfMs && t <= fwdMs; });
      if (window.length < 4 || after.length === 0) continue;

      // "Today's price" is the last poll on or before noon of that day.
      const current = window[window.length - 1].price_per_adult_usd;
      const features = featurize({ history: window, currentPrice: current, asOf, departDate: s.depart_date });
      if (!features) continue;
      const minAfter = Math.min(...after.map(p => p.price_per_adult_usd));
      const label = labelFor(current, minAfter);
      if (!label) continue;

      // The rules' call at that moment, using the same daily series the live
      // poller feeds them, so the comparison is fair.
      const daily = dailySeries(window);
      const rv = computeVerdict(daily, current, current);
      const rulesAsClass: FareClass | null = rv ? (rv.verdict === 'wait' ? 'wait' : 'buy') : null;
      examples.push({ features, label, rulesVerdict: rulesAsClass, route, asOf });
      made++;
    }
    if (made) used++; else skipped++;
  }
  return { examples, searches: used, skipped };
}

/** Collapse polls to one point per day (the day's minimum), the shape the
 *  live verdict is computed on. */
function dailySeries(snaps: Snap[]): Snap[] {
  const byDay = new Map<string, number>();
  for (const p of snaps) {
    const day = p.polled_at.slice(0, 10);
    const cur = byDay.get(day);
    if (cur == null || p.price_per_adult_usd < cur) byDay.set(day, p.price_per_adult_usd);
  }
  return [...byDay.entries()].sort().map(([day, price]) => ({ polled_at: day, price_per_adult_usd: price }));
}

export type TrainRunResult = {
  ok: boolean;
  examples: number;
  searches: number;
  testAccuracy: number;
  rulesAccuracy: number;
  accepted: boolean;
  reason: string;
  perClass?: FareModel['metrics']['perClass'];
};

/** The nightly job. Trains, compares against the rules, keeps the winner. */
export async function runFareModelTraining(): Promise<TrainRunResult> {
  const { examples, searches, skipped } = buildExamples();
  const started = new Date().toISOString();
  const finish = (r: TrainRunResult) => {
    queries.setSetting(LOG_KEY, JSON.stringify({ at: started, ...r }));
    return r;
  };

  if (examples.length < 50) {
    return finish({ ok: false, examples: examples.length, searches, testAccuracy: 0, rulesAccuracy: 0, accepted: false,
      reason: `only ${examples.length} examples from ${searches} routes (${skipped} skipped) — need 50; the model needs more polling history first` });
  }

  const model = trainFareModel(examples, { epochs: 250, learningRate: 0.05, seed: 7 });
  const m = model.metrics;
  // Accept only if it beats the rules on routes it never saw, by a margin
  // that is not noise on a test set this size.
  const accepted = m.testAccuracy >= m.rulesAccuracyOnTest + 0.02;
  if (accepted) queries.setSetting(MODEL_KEY, JSON.stringify(model));
  cached = null; // force a reload on next decision

  return finish({
    ok: true, examples: examples.length, searches,
    testAccuracy: m.testAccuracy, rulesAccuracy: m.rulesAccuracyOnTest, accepted,
    reason: accepted
      ? `model ${(m.testAccuracy * 100).toFixed(1)}% vs rules ${(m.rulesAccuracyOnTest * 100).toFixed(1)}% on ${m.testExamples} held-out examples — stored`
      : `model ${(m.testAccuracy * 100).toFixed(1)}% did not beat rules ${(m.rulesAccuracyOnTest * 100).toFixed(1)}% by 2 points — previous model kept`,
    perClass: m.perClass,
  });
}

// ---- loading at decision time ----------------------------------------------

let cached: { model: FareModel | null; at: number } | null = null;
const CACHE_MS = 5 * 60_000;

/** The current model, or null when none has been accepted yet. Cached for
 *  five minutes so a page with forty verdicts parses the JSON once. */
export function loadFareModel(): FareModel | null {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.model;
  let model: FareModel | null = null;
  try {
    const raw = queries.getSetting(MODEL_KEY);
    if (raw) model = JSON.parse(raw) as FareModel;
  } catch { model = null; }
  cached = { model, at: Date.now() };
  return model;
}

export function lastTrainingRun(): (TrainRunResult & { at: string }) | null {
  try {
    const raw = queries.getSetting(LOG_KEY);
    return raw ? (JSON.parse(raw) as TrainRunResult & { at: string }) : null;
  } catch { return null; }
}

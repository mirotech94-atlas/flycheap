import { describe, it, expect } from 'vitest';
import { Network, fitScaler, applyScaler, seededRandom } from '../src/lib/nn/network';
import { featurize, labelFor, trainFareModel, predictFare, FEATURE_NAMES, type Example } from '../src/lib/nn/fareModel';
import { blendVerdict, OVERRIDE_MIN_PROB } from '../src/lib/nn/verdictBlend';
import { computeVerdict } from '../src/lib/verdict';

describe('network', () => {
  it('learns XOR — the classic test a network must pass to be worth anything', () => {
    const net = new Network({ inputs: 2, layers: [{ size: 8, activation: 'relu' }, { size: 2, activation: 'softmax' }] }, 3);
    const X = [[0, 0], [0, 1], [1, 0], [1, 1]];
    const Y = [[1, 0], [0, 1], [0, 1], [1, 0]];
    for (let i = 0; i < 1500; i++) net.trainBatch(X, Y, 0.1, 0);
    const pred = X.map(x => net.predict(x).indexOf(Math.max(...net.predict(x))));
    expect(pred).toEqual([0, 1, 1, 0]);
  });

  it('is deterministic for a given seed', () => {
    const a = new Network({ inputs: 3, layers: [{ size: 4, activation: 'relu' }, { size: 1, activation: 'sigmoid' }] }, 11);
    const b = new Network({ inputs: 3, layers: [{ size: 4, activation: 'relu' }, { size: 1, activation: 'sigmoid' }] }, 11);
    expect(a.predict([0.2, -1, 3])).toEqual(b.predict([0.2, -1, 3]));
  });

  it('round-trips through JSON weights', () => {
    const net = new Network({ inputs: 2, layers: [{ size: 3, activation: 'relu' }, { size: 2, activation: 'softmax' }] }, 5);
    const copy = Network.fromWeights(JSON.parse(JSON.stringify(net.toWeights())));
    expect(copy.predict([0.5, 0.5])).toEqual(net.predict([0.5, 0.5]));
  });

  it('scaler standardises to mean 0 / std 1', () => {
    const rows = [[1, 100], [3, 300], [5, 500]];
    const s = fitScaler(rows);
    const z = rows.map(r => applyScaler(s, r));
    expect(z[1]).toEqual([0, 0]);
    expect(z[0][0]).toBeCloseTo(-1.2247, 3);
  });
});

/** A synthetic 45-day series with a known shape. */
function series(prices: number[], endIso = '2026-09-20T12:00:00Z') {
  const end = Date.parse(endIso);
  return prices.map((p, i) => ({ polled_at: new Date(end - (prices.length - 1 - i) * 86_400_000).toISOString(), price_per_adult_usd: p }));
}

describe('fare features and labels', () => {
  it('returns null on thin history and a full vector otherwise', () => {
    expect(featurize({ history: series([500, 510, 520]), currentPrice: 500, asOf: '2026-09-20T12:00:00Z' })).toBeNull();
    const f = featurize({ history: series(Array.from({ length: 20 }, (_, i) => 600 - i * 5)), currentPrice: 505, asOf: '2026-09-20T12:00:00Z' });
    expect(f).not.toBeNull();
    expect(f!.length).toBe(FEATURE_NAMES.length);
    expect(f!.every(v => Number.isFinite(v))).toBe(true);
  });

  it('puts a falling series at the bottom of its range and a rising one at the top', () => {
    const falling = featurize({ history: series(Array.from({ length: 20 }, (_, i) => 900 - i * 10)), currentPrice: 710, asOf: '2026-09-20T12:00:00Z' })!;
    const rising = featurize({ history: series(Array.from({ length: 20 }, (_, i) => 700 + i * 10)), currentPrice: 890, asOf: '2026-09-20T12:00:00Z' })!;
    expect(falling[0]).toBeLessThan(0.1);   // positionInRange
    expect(rising[0]).toBeGreaterThan(0.9);
    expect(falling[3]).toBeLessThan(0);     // trendPct
    expect(rising[3]).toBeGreaterThan(0);
  });

  it('labels from what actually happened next', () => {
    expect(labelFor(1000, 900)).toBe('wait');   // 10% drop followed
    expect(labelFor(1000, 1000)).toBe('buy');   // nothing cheaper
    expect(labelFor(1000, 995)).toBe('buy');    // $5 wobble is not a reason to wait
    expect(labelFor(1000, 980)).toBe('hold');   // 2% — cheaper, not meaningfully
    expect(labelFor(1000, null)).toBeNull();
  });
});

describe('training on a learnable pattern', () => {
  it('beats chance on synthetic routes where "wait" follows a rising price and "buy" follows a falling one', () => {
    const rnd = seededRandom(99);
    const examples: Example[] = [];
    for (let r = 0; r < 12; r++) {
      for (let d = 0; d < 40; d++) {
        const up = rnd() < 0.5;
        const base = 400 + rnd() * 800;
        const prices = Array.from({ length: 20 }, (_, i) => base + (up ? i : -i) * (5 + rnd() * 5) + (rnd() - 0.5) * 20);
        const cur = prices[prices.length - 1];
        const f = featurize({ history: series(prices), currentPrice: cur, asOf: '2026-09-20T12:00:00Z' })!;
        examples.push({ features: f, label: up ? 'wait' : 'buy', rulesVerdict: null, route: `R${r}`, asOf: '2026-09-20' });
      }
    }
    const model = trainFareModel(examples, { epochs: 120, learningRate: 0.05, seed: 3 });
    expect(model.metrics.testExamples).toBeGreaterThan(0);
    expect(model.metrics.testAccuracy).toBeGreaterThan(0.8);
    const p = predictFare(model, examples[0].features);
    expect(Math.abs(p.buy + p.wait + p.hold - 1)).toBeLessThan(1e-6);
  });
});

describe('blend', () => {
  it('keeps the rules when there is no model, and marks why', () => {
    const hist = series(Array.from({ length: 20 }, (_, i) => 600 - i * 5));
    const rules = computeVerdict(hist, 505, 550)!;
    const b = blendVerdict(rules, null, { history: hist, asOf: '2026-09-20T12:00:00Z' });
    expect(b.verdict).toBe(rules.verdict);
    expect(b.source).toBe('rules-only-no-model');
  });

  it('only overrides when the model is confident, and says so in the reason', () => {
    const hist = series(Array.from({ length: 20 }, (_, i) => 600 - i * 5));
    const rules = computeVerdict(hist, 505, 550)!;
    const fake = (probs: [number, number, number]) => ({
      version: 1, trainedAt: '', featureNames: FEATURE_NAMES,
      scaler: { mean: new Array(FEATURE_NAMES.length).fill(0), std: new Array(FEATURE_NAMES.length).fill(1) },
      network: { spec: { inputs: FEATURE_NAMES.length, layers: [{ size: 3, activation: 'softmax' as const }] },
        weights: [Array.from({ length: 3 }, () => new Array(FEATURE_NAMES.length).fill(0))],
        biases: [probs.map(p => Math.log(p))] },
      metrics: { trainExamples: 0, testExamples: 0, testAccuracy: 0, rulesAccuracyOnTest: 0, epochs: 0, finalLoss: 0,
        perClass: { buy: { precision: 0, recall: 0, support: 0 }, wait: { precision: 0, recall: 0, support: 0 }, hold: { precision: 0, recall: 0, support: 0 } } },
    });
    // Rules say buy on this falling series; a confident "wait" model overrides.
    expect(rules.verdict).toBe('buy');
    const strong = blendVerdict(rules, fake([0.1, 0.85, 0.05]), { history: hist, asOf: '2026-09-20T12:00:00Z' });
    expect(strong.source).toBe('model-override');
    expect(strong.verdict).toBe('wait');
    expect(strong.reason).toMatch(/85% chance/);
    // A lukewarm model does not.
    const weak = blendVerdict(rules, fake([0.4, 0.45, 0.15]), { history: hist, asOf: '2026-09-20T12:00:00Z' });
    expect(weak.source).toBe('rules');
    expect(weak.verdict).toBe('buy');
    expect(weak.confidencePct).toBeLessThan(rules.confidencePct + 1);
    expect(OVERRIDE_MIN_PROB).toBeGreaterThan(0.5);
  });
});

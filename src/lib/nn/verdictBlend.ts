/**
 * How the network and the rules make one decision together.
 *
 * The rules in verdict.ts are transparent: every verdict comes with a reason
 * a customer can read. The network is more accurate on the routes it has
 * learned, and useless on a route with two days of history. So:
 *
 *   1. The rules always run. Their verdict is the default.
 *   2. If a trained model exists and the route has enough history to
 *      featurize, the network gives its probabilities.
 *   3. The network may OVERRIDE the rules only when it is confident
 *      (top probability ≥ OVERRIDE_MIN_PROB) and clearly ahead of its
 *      runner-up (margin ≥ OVERRIDE_MIN_MARGIN). Otherwise it only adjusts
 *      the confidence figure — up when it agrees, down when it disagrees.
 *   4. Every decision records which path it took, so /admin/trust can show
 *      how often the model overrode and whether those overrides were right.
 *
 * The reason string stays the rules' own when they win; when the network
 * overrides, the reason says so in plain words and cites the probability,
 * never a number the model did not produce.
 */

import type { Verdict, VerdictKind, VerdictPoint } from '@/lib/verdict';
import { featurize, predictFare, type FareModel, type FareClass } from './fareModel';

export const OVERRIDE_MIN_PROB = 0.70;
export const OVERRIDE_MIN_MARGIN = 0.25;

export type BlendSource = 'rules' | 'model-agrees' | 'model-override' | 'rules-only-no-model' | 'rules-only-thin-history';

export type BlendedVerdict = Verdict & {
  source: BlendSource;
  /** The network's view, when it had one. */
  modelProbs: Record<FareClass, number> | null;
  /** What the rules said before any override. */
  rulesVerdict: VerdictKind;
  rulesConfidencePct: number;
};

const LABELS: Record<VerdictKind, string> = { buy: 'Buy now', wait: 'Wait', hold: 'Hold' };

export function blendVerdict(
  rules: Verdict,
  model: FareModel | null,
  ctx: { history: VerdictPoint[]; asOf?: string; departDate?: string | null },
): BlendedVerdict {
  const base: BlendedVerdict = {
    ...rules,
    source: 'rules-only-no-model',
    modelProbs: null,
    rulesVerdict: rules.verdict,
    rulesConfidencePct: rules.confidencePct,
  };
  if (!model) return base;

  const features = featurize({
    history: ctx.history,
    currentPrice: rules.currentPrice,
    asOf: ctx.asOf ?? new Date().toISOString(),
    departDate: ctx.departDate ?? null,
  });
  if (!features) return { ...base, source: 'rules-only-thin-history' };

  const probs = predictFare(model, features);
  const ranked = (Object.entries(probs) as [FareClass, number][]).sort((a, b) => b[1] - a[1]);
  const [top, topP] = ranked[0];
  const margin = topP - ranked[1][1];

  if (top === rules.verdict) {
    // Agreement: the confidence figure moves toward what the network thinks.
    const conf = Math.round(Math.max(rules.confidencePct, Math.min(95, 55 + topP * 40)));
    return { ...base, confidencePct: conf, source: 'model-agrees', modelProbs: probs };
  }

  if (topP >= OVERRIDE_MIN_PROB && margin >= OVERRIDE_MIN_MARGIN) {
    const pct = Math.round(topP * 100);
    const reason = top === 'wait'
      ? `Our model puts a ${pct}% chance on a cheaper fare within 7 days, based on how this route has moved. ${rules.reason}`
      : top === 'buy'
      ? `Our model puts a ${pct}% chance on this being the low for the next 7 days. ${rules.reason}`
      : `Our model reads the next 7 days as a coin flip (${pct}% hold). ${rules.reason}`;
    return {
      ...base,
      verdict: top,
      label: LABELS[top],
      confidencePct: Math.round(Math.min(95, Math.max(55, topP * 100))),
      reason,
      // A wait the rules did not make has no trend projection behind it.
      expectedSavings: top === 'wait' ? rules.expectedSavings : null,
      source: 'model-override',
      modelProbs: probs,
    };
  }

  // Disagreement without enough conviction to override: keep the rules'
  // verdict, but be honest that the picture is mixed.
  const conf = Math.round(Math.max(55, rules.confidencePct - Math.round((1 - probs[rules.verdict]) * 20)));
  return { ...base, confidencePct: conf, source: 'rules', modelProbs: probs };
}

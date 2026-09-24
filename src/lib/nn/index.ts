/**
 * The one entry point the app uses for a decision. Every place that used to
 * call computeVerdict() directly now calls decide(): rules first, then the
 * trained network's view blended in per verdictBlend.ts. Keeping this a
 * single function means the network can never be bypassed by accident and
 * can be switched off in one place.
 */
import { computeVerdict, type VerdictPoint } from '@/lib/verdict';
import { blendVerdict, type BlendedVerdict } from './verdictBlend';
import { loadFareModel } from './train';

export { blendVerdict, type BlendedVerdict, type BlendSource } from './verdictBlend';
export { loadFareModel, lastTrainingRun, runFareModelTraining } from './train';
export { FEATURE_NAMES, CLASSES, type FareModel, type FareClass } from './fareModel';

/** Set FARE_MODEL=off to run on the rules alone without redeploying. */
function modelEnabled(): boolean {
  return (process.env.FARE_MODEL || 'on').trim().toLowerCase() !== 'off';
}

export function decide(
  history: VerdictPoint[],
  currentPrice: number,
  threshold: number,
  ctx: { departDate?: string | null; asOf?: string } = {},
): BlendedVerdict | null {
  const rules = computeVerdict(history, currentPrice, threshold);
  if (!rules) return null;
  const model = modelEnabled() ? loadFareModel() : null;
  return blendVerdict(rules, model, { history, asOf: ctx.asOf, departDate: ctx.departDate ?? null });
}

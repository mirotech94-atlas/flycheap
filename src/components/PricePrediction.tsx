import { computeVerdict, MIN_VERDICT_SAMPLES, type VerdictPoint } from '@/lib/verdict';
import { FcVerdictCard, FcVerdictPending } from './FcVerdictCard';

/**
 * Buy now / Wait / Hold recommendation derived from price history.
 *
 * Thin wrapper: the math lives in `lib/verdict.ts` (trend, z-score, slope,
 * percentile, confidence, expected savings) and the presentation in
 * `FcVerdictCard` (Kayak/Hopper pattern in the canonical FlyCheap system).
 * Keeps the original props so existing call sites don't change.
 */
export function PricePrediction({
  history,
  currentPrice,
  threshold,
}: {
  history: VerdictPoint[];
  currentPrice: number | null;
  threshold: number;
}) {
  const verdict = currentPrice ? computeVerdict(history, currentPrice, threshold) : null;
  return (
    <div className="fc-shell">
      {verdict
        ? <FcVerdictCard verdict={verdict} />
        : <FcVerdictPending samples={history.length} needed={MIN_VERDICT_SAMPLES} />}
    </div>
  );
}

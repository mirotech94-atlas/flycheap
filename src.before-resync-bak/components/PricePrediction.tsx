import { fmtUSD } from '@/lib/utils';

type Snap = { polled_at: string; price_per_adult_usd: number };

/**
 * Hopper-style "Buy now / Wait / Watching" recommendation derived from price
 * history. Pure deterministic logic — no ML, just trend + volatility heuristics
 * that are easy to explain to the user.
 */
export function PricePrediction({
  history,
  currentPrice,
  threshold,
}: {
  history: Snap[];
  currentPrice: number | null;
  threshold: number;
}) {
  if (!currentPrice || history.length < 4) {
    return (
      <div className="card !p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 grid place-items-center">📊</div>
          <div>
            <div className="eyebrow !text-[10px]">Price prediction</div>
            <div className="font-display font-bold text-sm">Gathering data…</div>
          </div>
        </div>
        <p className="text-xs text-slate-500">Need ≥4 polls of history to make a confident call. Keep watching — the bot polls every {''}
          {Math.max(5, Math.floor(history.length / 2))} min.
        </p>
      </div>
    );
  }

  const prices = history.map(h => h.price_per_adult_usd);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const median = [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)];

  // 7-day window vs older window (use halves of available history when we don't
  // have enough days to bucket strictly).
  const cutoff = Math.floor(history.length / 2);
  const recent = prices.slice(cutoff);
  const older  = prices.slice(0, cutoff);
  const recentAvg = recent.reduce((s, p) => s + p, 0) / recent.length;
  const olderAvg  = older.length ? older.reduce((s, p) => s + p, 0) / older.length : recentAvg;
  const trendPct = ((recentAvg - olderAvg) / olderAvg) * 100;
  const range = max - min;
  const positionInRange = range > 0 ? (currentPrice - min) / range : 0;
  const vsThresholdPct = ((currentPrice - threshold) / threshold) * 100;

  // ---- Decision rules ----
  // BUY if: at/near historical low AND below threshold OR trend rising + price is near low
  // WAIT if: trend falling AND price is high in range
  // WATCH otherwise
  let verdict: 'buy' | 'wait' | 'watch';
  let confidence: 'high' | 'medium' | 'low';
  let reason: string;

  if (currentPrice <= min * 1.03 && vsThresholdPct < 5) {
    verdict = 'buy';
    confidence = 'high';
    reason = `At ${positionInRange < 0.05 ? 'the' : 'near the'} 30-day low (${fmtUSD(min)}). ${vsThresholdPct < 0 ? 'Below' : 'At'} your target.`;
  } else if (trendPct > 5 && positionInRange < 0.4) {
    verdict = 'buy';
    confidence = 'medium';
    reason = `Rising +${trendPct.toFixed(0)}% lately but still in the lower third of recent prices. Lock in.`;
  } else if (trendPct < -5 && positionInRange > 0.6) {
    verdict = 'wait';
    confidence = 'high';
    reason = `Falling ${trendPct.toFixed(0)}% in the recent window — likely keeps dropping. ${fmtUSD(currentPrice - min)} above the 30d low.`;
  } else if (vsThresholdPct > 30) {
    verdict = 'wait';
    confidence = 'medium';
    reason = `${fmtUSD(currentPrice - threshold)} above your ${fmtUSD(threshold)} target. Median 30d is ${fmtUSD(median)}.`;
  } else if (positionInRange < 0.3) {
    verdict = 'buy';
    confidence = 'medium';
    reason = `Bottom third of the 30d range — good value historically.`;
  } else {
    verdict = 'watch';
    confidence = 'low';
    reason = `Mid-range price, no strong trend. We'll alert if it drops below ${fmtUSD(threshold)} or ${10}% below median.`;
  }

  const verdictMeta = {
    buy:   { label: 'Buy now', emoji: '✅', bg: 'from-emerald-500 to-emerald-600', text: 'text-white', accent: 'bg-emerald-500' },
    wait:  { label: 'Wait',    emoji: '⏳', bg: 'from-amber-500 to-orange-500',   text: 'text-white', accent: 'bg-amber-500'   },
    watch: { label: 'Watching', emoji: '👀', bg: 'from-slate-500 to-slate-600',   text: 'text-white', accent: 'bg-slate-500'   },
  }[verdict];

  return (
    <div className="card !p-0 overflow-hidden">
      <div className={`bg-gradient-to-br ${verdictMeta.bg} ${verdictMeta.text} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="text-2xl">{verdictMeta.emoji}</div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-semibold opacity-80">
              Recommendation · {confidence} confidence
            </div>
            <div className="font-display font-extrabold text-xl leading-tight">{verdictMeta.label}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide opacity-80">Right now</div>
          <div className="font-bold tabular text-lg">{fmtUSD(currentPrice)}</div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{reason}</p>

        {/* Mini timeline showing where current price sits in 30d range */}
        <div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
            <span className="tabular">{fmtUSD(min)} <span className="text-emerald-600 font-semibold">30d low</span></span>
            <span className="tabular">{fmtUSD(max)} <span className="text-red-600 font-semibold">30d high</span></span>
          </div>
          <div className="relative h-2 bg-gradient-to-r from-emerald-200 via-amber-200 to-red-200 rounded-full">
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${verdictMeta.accent} ring-2 ring-white shadow-md`}
              style={{ left: `calc(${positionInRange * 100}% - 6px)` }}
              title={`${fmtUSD(currentPrice)} (${(positionInRange * 100).toFixed(0)}th percentile)`}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
            <span>cheap</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              you're at the {(positionInRange * 100).toFixed(0)}th percentile
            </span>
            <span>pricey</span>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-200/60 dark:border-slate-700">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Trend</div>
            <div className={`text-sm font-bold tabular ${trendPct >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {trendPct >= 0 ? '+' : ''}{trendPct.toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Median 30d</div>
            <div className="text-sm font-bold tabular text-slate-700 dark:text-slate-200">{fmtUSD(median)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">vs target</div>
            <div className={`text-sm font-bold tabular ${vsThresholdPct < 0 ? 'text-emerald-600' : 'text-amber-700'}`}>
              {vsThresholdPct >= 0 ? '+' : ''}{vsThresholdPct.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

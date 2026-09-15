import type { Verdict } from '@/lib/verdict';

/**
 * Kayak / Hopper-style verdict block in the canonical FlyCheap system.
 *
 *   ┌ BUY NOW ──────────────── we're 79% confident ┐
 *   │ At the 30-day low ($589). Below your target.  │
 *   │ $589 ───●──────[typical]─────────── $812      │
 *   │ 12th percentile · trend −6% · z −1.2          │
 *   └───────────────────────────────────────────────┘
 *
 * Pure presentational: no hooks, no client JS, so it renders inside both
 * server components and client trees (FcRouteDna). Styles live in the
 * `.fc-verdict*` block at the end of globals.css.
 */
const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function FcVerdictCard({ verdict: v, compact = false }: { verdict: Verdict; compact?: boolean }) {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const range = Math.max(1, v.max - v.min);
  const bandLeft = (v.p25 - v.min) / range;
  const bandWidth = Math.max(0.02, (v.p75 - v.p25) / range);
  const marker = v.positionInRange;
  const waitBy = (() => {
    const d = new Date();
    d.setDate(d.getDate() + v.savingsHorizonDays);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  return (
    <div className={`fc-verdict fc-verdict-${v.verdict}${compact ? ' fc-verdict-compact' : ''}`}>
      <div className="fc-verdict-head">
        <div className="fc-verdict-call">
          <span className="fc-verdict-dot" aria-hidden />
          <span className="fc-verdict-label">{v.label}</span>
        </div>
        <div className="fc-verdict-conf" title="Agreement between trend, range position and z-score signals">
          we&apos;re <strong>{v.confidencePct}%</strong> confident
        </div>
      </div>

      <p className="fc-verdict-reason">
        {v.reason}
        {v.verdict === 'wait' && v.expectedSavings != null && (
          <> Waiting could save <strong>~{fmt(v.expectedSavings)}</strong> by {waitBy}.</>
        )}
      </p>

      {/* Google "typical price range" band with the current price positioned inside it */}
      <div className="fc-verdict-range" role="img" aria-label={`${fmt(v.currentPrice)} is at the ${ordinal(v.percentile)} percentile of the 30-day range ${fmt(v.min)} to ${fmt(v.max)}`}>
        <div className="fc-verdict-range-labels">
          <span><b>{fmt(v.min)}</b> 30d low</span>
          <span>typical {fmt(v.p25)}–{fmt(v.p75)}</span>
          <span>30d high <b>{fmt(v.max)}</b></span>
        </div>
        <div className="fc-verdict-track">
          <div className="fc-verdict-band" style={{ left: pct(bandLeft), width: pct(bandWidth) }} />
          <div className="fc-verdict-marker" style={{ left: pct(marker) }} title={`${fmt(v.currentPrice)} · ${ordinal(v.percentile)} percentile`}>
            <span className="fc-verdict-marker-price">{fmt(v.currentPrice)}</span>
          </div>
        </div>
        <div className="fc-verdict-range-foot">
          <span>cheap</span>
          <span>you&apos;re at the <b>{ordinal(v.percentile)}</b> percentile</span>
          <span>pricey</span>
        </div>
      </div>

      {!compact && (
        <div className="fc-verdict-stats">
          <div>
            <div className="fc-verdict-stat-label">Trend</div>
            <div className={`fc-verdict-stat-value ${v.trendPct >= 0 ? 'up' : 'down'}`}>
              {v.trendPct >= 0 ? '+' : ''}{v.trendPct.toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="fc-verdict-stat-label">Median 30d</div>
            <div className="fc-verdict-stat-value">{fmt(v.median)}</div>
          </div>
          <div>
            <div className="fc-verdict-stat-label">vs target</div>
            <div className={`fc-verdict-stat-value ${v.vsThresholdPct < 0 ? 'down' : 'up'}`}>
              {v.vsThresholdPct >= 0 ? '+' : ''}{v.vsThresholdPct.toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="fc-verdict-stat-label">z-score</div>
            <div className="fc-verdict-stat-value">{v.zScore >= 0 ? '+' : ''}{v.zScore.toFixed(1)}σ</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small "gathering data" placeholder for routes with < 4 polls. */
export function FcVerdictPending({ samples, needed }: { samples: number; needed: number }) {
  return (
    <div className="fc-verdict fc-verdict-hold fc-verdict-compact">
      <div className="fc-verdict-head">
        <div className="fc-verdict-call">
          <span className="fc-verdict-dot" aria-hidden />
          <span className="fc-verdict-label">Gathering data</span>
        </div>
        <div className="fc-verdict-conf">{samples}/{needed} polls</div>
      </div>
      <p className="fc-verdict-reason">
        We need at least {needed} days of history to make a confident buy / wait call. Keep watching — the poller runs every ~30 min.
      </p>
    </div>
  );
}

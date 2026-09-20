import type { VerdictPoint } from '@/lib/verdict';

/**
 * The price history chart — the hero of the watch detail screen.
 *
 * "The price history chart is the hero, with the user's target as a horizontal
 *  line and alerts marked on it."
 *
 * Server-rendered SVG, no client JS: it is a static picture of a static series,
 * and shipping a charting library to draw thirty points would be the single
 * heaviest thing on the page.
 *
 * Amber is on the TARGET LINE only — that is the number the user set and the
 * one the whole page is about. The series itself is teal, the band is a faint
 * fill; if the line were amber too, nothing would stand out.
 */

const W = 720;
const H = 220;
const PAD = { top: 16, right: 56, bottom: 26, left: 8 };

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function PriceChart({
  history, targetPerAdult, targetIsEquivalent, low, high,
}: {
  history: VerdictPoint[];
  /** Per adult, the same unit as the series. */
  targetPerAdult: number | null;
  /** True when the line is the per-adult EQUIVALENT of a party target, which
   *  is not the number the user typed and must not be presented as if it were. */
  targetIsEquivalent?: boolean;
  low: number | null;
  high: number | null;
}) {
  if (history.length < 2) return null;

  const prices = history.map(h => h.price_per_adult_usd);
  // The target has to be inside the drawn range or its line falls off the top
  // of the chart and silently disappears — which reads as "no target set".
  const candidates = [...prices, ...(targetPerAdult != null ? [targetPerAdult] : [])];
  const minV = Math.min(...candidates);
  const maxV = Math.max(...candidates);
  const span = maxV - minV || Math.max(1, maxV * 0.05);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (history.length === 1 ? plotW / 2 : (i / (history.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - minV) / span) * plotH;

  const line = prices.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(prices.length - 1).toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + plotH).toFixed(1)} Z`;

  const lastV = prices[prices.length - 1];
  const bandTop = high != null ? y(high) : null;
  const bandBottom = low != null ? y(low) : null;

  const firstDay = history[0].polled_at.slice(0, 10);
  const lastDay = history[history.length - 1].polled_at.slice(0, 10);

  return (
    <>
      <svg
        className="nc-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={
          `Price per adult over the last ${history.length} days, from ${money(minV)} to ${money(maxV)}. `
          + `Today ${money(lastV)}.`
          + (targetPerAdult != null
            ? ` Your target is ${money(targetPerAdult)} per adult${targetIsEquivalent ? ' equivalent' : ''}.`
            : '')
        }
      >
        {/* The 30-day band the verdict is judged against. */}
        {bandTop != null && bandBottom != null && (
          <rect
            x={PAD.left} y={bandTop} width={plotW} height={Math.max(1, bandBottom - bandTop)}
            fill="var(--nc-teal)" opacity="0.07"
          />
        )}

        <path d={area} fill="var(--nc-teal)" opacity="0.13" />
        <path d={line} fill="none" stroke="var(--nc-teal)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

        {/* The user's target. The one amber thing on the chart. */}
        {targetPerAdult != null && (
          <>
            <line
              x1={PAD.left} x2={PAD.left + plotW} y1={y(targetPerAdult)} y2={y(targetPerAdult)}
              stroke="var(--nc-amber)" strokeWidth="1.5" strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PAD.left + plotW + 6} y={y(targetPerAdult) + 4}
              fill="var(--nc-amber)" fontSize="11" fontFamily="var(--nc-mono)"
            >
              {money(targetPerAdult)}
            </text>
          </>
        )}

        {/* Today. */}
        <circle cx={x(prices.length - 1)} cy={y(lastV)} r="3.5" fill="var(--nc-on-dark)" />

        <text x={PAD.left} y={H - 8} fill="var(--nc-on-dark-faint)" fontSize="11">{firstDay}</text>
        <text x={PAD.left + plotW} y={H - 8} fill="var(--nc-on-dark-faint)" fontSize="11" textAnchor="end">{lastDay}</text>
      </svg>

      <div className="nc-chart-legend">
        <span>
          <i className="nc-swatch" style={{ background: 'var(--nc-teal)' }} /> Price per adult
        </span>
        {targetPerAdult != null && (
          <span>
            <i className="nc-swatch" style={{ background: 'var(--nc-amber)' }} />
            {targetIsEquivalent
              ? `Your target, per adult (${money(targetPerAdult)} each)`
              : 'Your target'}
          </span>
        )}
        {low != null && high != null && (
          <span>
            <i className="nc-swatch" style={{ background: 'color-mix(in srgb, var(--nc-teal) 30%, transparent)', height: '9px' }} />
            30-day range {money(low)}–{money(high)}
          </span>
        )}
        <span>Daily lowest recorded price. Sub-daily movement is not shown.</span>
      </div>
    </>
  );
}

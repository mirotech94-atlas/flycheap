/**
 * 30-day price sparkline in the canonical FlyCheap system (navy line, gold
 * fill, mono min/max labels). Server-renderable — plain inline SVG, no
 * hooks — so it works in server components and inside client trees alike.
 *
 * Data is the same shape loadDashboard() produces (daily minimums from
 * fare_snapshots). The lowest point gets a gold marker, the latest point a
 * navy one; optional dashed line for the user's target.
 */
export type SparkPoint = { polled_at: string; price_per_adult_usd: number };

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function shortDay(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function FcRouteSparkline({
  data,
  threshold,
  width = 260,
  height = 56,
  showLabels = true,
  caption,
}: {
  data: SparkPoint[];
  threshold?: number;
  width?: number;
  height?: number;
  showLabels?: boolean;
  caption?: string;
}) {
  const points = [...data]
    .filter(p => Number.isFinite(p.price_per_adult_usd))
    .sort((a, b) => a.polled_at.localeCompare(b.polled_at));

  if (points.length < 2) {
    return (
      <div className="fc-spark fc-spark-empty">
        <span className="fc-spark-caption">Not enough history yet — sparkline appears after 2 polled days.</span>
      </div>
    );
  }

  const prices = points.map(p => p.price_per_adult_usd);
  let minIdx = 0;
  let maxIdx = 0;
  prices.forEach((p, i) => {
    if (p < prices[minIdx]) minIdx = i;
    if (p > prices[maxIdx]) maxIdx = i;
  });
  const min = prices[minIdx];
  const max = prices[maxIdx];
  const lo = Math.min(min, threshold ?? Infinity);
  const hi = Math.max(max, threshold ?? -Infinity);
  const range = Math.max(1, hi - lo);
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const xy = points.map((p, i) => ({
    x: pad + (i / (points.length - 1)) * w,
    y: pad + h - ((p.price_per_adult_usd - lo) / range) * h,
  }));
  const path = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L${xy[xy.length - 1].x.toFixed(1)},${(pad + h).toFixed(1)} L${xy[0].x.toFixed(1)},${(pad + h).toFixed(1)} Z`;
  const last = xy[xy.length - 1];
  const lowPt = xy[minIdx];
  const thresholdY = threshold != null ? pad + h - ((threshold - lo) / range) * h : null;
  const first = prices[0];
  const lastPrice = prices[prices.length - 1];
  const pctChange = first > 0 ? ((lastPrice - first) / first) * 100 : 0;
  const trendDown = lastPrice <= first;

  return (
    <div className="fc-spark">
      {showLabels && (
        <div className="fc-spark-labels">
          <span className="fc-spark-min" title={`30d low on ${shortDay(points[minIdx].polled_at)}`}>▼ {fmt(min)} low</span>
          <span className={`fc-spark-delta ${trendDown ? 'down' : 'up'}`} title={`${points.length} polled days`}>
            {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(0)}% · 30d
          </span>
          <span className="fc-spark-max" title={`30d high on ${shortDay(points[maxIdx].polled_at)}`}>▲ {fmt(max)} high</span>
        </div>
      )}
      <svg
        className="fc-spark-svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`30-day price history: low ${fmt(min)}, high ${fmt(max)}, now ${fmt(lastPrice)}`}
      >
        <path d={area} className="fc-spark-area" />
        {thresholdY != null && (
          <line x1={pad} x2={pad + w} y1={thresholdY} y2={thresholdY} className="fc-spark-target" />
        )}
        <path d={path} className="fc-spark-line" />
        <circle cx={lowPt.x} cy={lowPt.y} r="3" className="fc-spark-low" />
        <circle cx={last.x} cy={last.y} r="3" className="fc-spark-last" />
      </svg>
      {caption && <div className="fc-spark-caption">{caption}</div>}
    </div>
  );
}

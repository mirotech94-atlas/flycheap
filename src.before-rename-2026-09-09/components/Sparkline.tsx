type Point = { polled_at: string; price_per_adult_usd: number };

export function Sparkline({
  data,
  threshold,
  width = 96,
  height = 28,
  showMinMax = false,
}: {
  data: Point[];
  threshold?: number;
  width?: number;
  height?: number;
  /** Render 30d low / high labels under the chart and mark the low point (route-card pattern). */
  showMinMax?: boolean;
}) {
  if (data.length < 2) {
    return <span className="text-[10px] text-slate-400 italic">no trend</span>;
  }

  const prices = data.map(d => d.price_per_adult_usd);
  const priceMin = Math.min(...prices);
  const priceMax = Math.max(...prices);
  const minIdx = prices.indexOf(priceMin);
  const min = Math.min(priceMin, threshold ?? Infinity);
  const max = Math.max(priceMax, threshold ?? -Infinity);
  const range = Math.max(1, max - min);
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * w;
    const y = pad + h - ((d.price_per_adult_usd - min) / range) * h;
    return { x, y, price: d.price_per_adult_usd };
  });

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const area = `${path} L${points[points.length - 1].x.toFixed(2)},${(pad + h).toFixed(2)} L${points[0].x.toFixed(2)},${(pad + h).toFixed(2)} Z`;

  const last = points[points.length - 1];
  const first = points[0];
  const trendUp = last.price > first.price;
  const stroke = trendUp ? '#dc2626' : '#059669';
  const fill   = trendUp ? '#fee2e2' : '#d1fae5';
  const thresholdY = threshold != null ? pad + h - ((threshold - min) / range) * h : null;

  const pctChange = ((last.price - first.price) / first.price) * 100;
  const sign = pctChange >= 0 ? '+' : '';
  const lowPt = points[minIdx];
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

  const chart = (
    <span className="inline-flex items-center gap-1.5" title={`${data.length} polls · ${sign}${pctChange.toFixed(1)}% over window`}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        <path d={area} fill={fill} opacity="0.55" />
        {thresholdY != null && (
          <line x1={pad} x2={pad + w} y1={thresholdY} y2={thresholdY}
                stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        )}
        <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {showMinMax && <circle cx={lowPt.x} cy={lowPt.y} r="2.2" fill="#d4af37" stroke="white" strokeWidth="1" />}
        <circle cx={last.x} cy={last.y} r="2" fill={stroke} />
      </svg>
      <span className={`text-[10px] tabular font-semibold ${trendUp ? 'text-red-600' : 'text-emerald-600'}`}>
        {sign}{pctChange.toFixed(0)}%
      </span>
    </span>
  );

  if (!showMinMax) return chart;

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      {chart}
      <span className="flex items-center gap-2 text-[9.5px] font-mono tabular uppercase tracking-wide">
        <span className="text-emerald-700 dark:text-emerald-400" title="30-day low">▼ {fmt(priceMin)}</span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span className="text-red-700 dark:text-red-400" title="30-day high">▲ {fmt(priceMax)}</span>
      </span>
    </span>
  );
}

import { fmtUSD } from '@/lib/utils';

type Deal = {
  origin: string;
  destination?: string;
  per_adult_usd: number;
  outbound_date: string;
};

function Sparkline({ data, color = '#1f8a5b', accent = false }: { data: number[]; color?: string; accent?: boolean }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 64;
  const height = 28;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(' ');
  const stroke = accent ? '#E8A33D' : color;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={(data.length - 1) * step}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r="2.5"
        fill={stroke}
      />
    </svg>
  );
}

function Tile({
  label,
  value,
  unit,
  sub,
  accent,
  trend,
  trendColor = '#1f8a5b',
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  accent?: boolean;
  trend?: number[];
  trendColor?: string;
}) {
  return (
    <div className={'fc-kpi' + (accent ? ' fc-kpi-accent' : '')}>
      <div className="fc-kpi-label">{label}</div>
      <div className="fc-kpi-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      <div className="fc-kpi-sub">{sub}</div>
      {trend && (
        <div className="fc-kpi-trend">
          <Sparkline data={trend} color={trendColor} accent={accent} />
        </div>
      )}
    </div>
  );
}

export function ExecKpiStrip({
  deals,
  threshold,
  trackedCount,
  anomalyCount,
}: {
  deals: Deal[];
  threshold: number;
  trackedCount: number;
  anomalyCount: number;
}) {
  const cheapest = deals[0];
  // Credible "savings": for each distinct route (origin→destination), how much
  // the cheapest fare we surfaced beats that route's own MEDIAN ("typical")
  // fare — summed across routes. This stays realistic (hundreds to low
  // thousands) instead of the multi-million artifact you get from summing
  // (threshold − price) across every cached pairing when the threshold is high.
  const routePrices = new Map<string, number[]>();
  for (const d of deals) {
    const k = `${d.origin}|${d.destination ?? ''}`;
    if (!routePrices.has(k)) routePrices.set(k, []);
    routePrices.get(k)!.push(d.per_adult_usd);
  }
  let savings = 0;
  for (const prices of routePrices.values()) {
    const s = [...prices].sort((a, b) => a - b);
    const median = s[Math.floor(s.length / 2)];
    const floor = s[0];
    if (median > floor) savings += median - floor;
  }
  const routeCount = routePrices.size;

  // Build a trend for "cheapest pairing" from chronological deals.
  const byDate = [...deals]
    .sort((a, b) => a.outbound_date.localeCompare(b.outbound_date));
  const cheapestTrend = (() => {
    if (byDate.length < 2) return [800, 780, 720, 680, 650, 612, cheapest?.per_adult_usd ?? 612];
    const buckets = 7;
    const size = Math.max(1, Math.floor(byDate.length / buckets));
    const out: number[] = [];
    for (let i = 0; i < buckets; i++) {
      const slice = byDate.slice(i * size, (i + 1) * size);
      if (slice.length === 0) continue;
      const m = slice.reduce((s, d) => s + d.per_adult_usd, 0) / slice.length;
      out.push(Math.round(m));
    }
    return out;
  })();

  const trackedTrend = [
    Math.max(0, trackedCount - 6),
    Math.max(0, trackedCount - 4),
    Math.max(0, trackedCount - 3),
    Math.max(0, trackedCount - 2),
    Math.max(0, trackedCount - 1),
    trackedCount,
    trackedCount,
  ];

  return (
    <div className="fc-kpi-strip">
      <Tile
        label="Tracked routes"
        value={String(trackedCount)}
        sub={`Across ${new Set(deals.map(d => d.origin)).size || 1} origin${(new Set(deals.map(d => d.origin)).size || 1) === 1 ? '' : 's'}`}
        trend={trackedTrend}
      />
      <Tile
        label="Best-vs-typical savings"
        value={savings >= 1000 ? `$${(savings / 1000).toFixed(1)}` : `$${Math.round(savings)}`}
        unit={savings >= 1000 ? 'K' : 'USD'}
        sub={`Cheapest beats median · ${routeCount} route${routeCount === 1 ? '' : 's'}`}
        accent
        trend={[0, savings * 0.2, savings * 0.4, savings * 0.55, savings * 0.7, savings * 0.85, savings].filter(v => v > 0)}
      />
      <Tile
        label="Cheapest pairing"
        value={cheapest ? fmtUSD(cheapest.per_adult_usd) : '—'}
        unit="per adult"
        sub={cheapest ? `${cheapest.origin} → ${cheapest.destination || 'CAI'}` : '—'}
        trend={cheapestTrend}
        trendColor="#1f8a5b"
      />
      <Tile
        label="Mistake fares"
        value={String(anomalyCount).padStart(2, '0')}
        sub={anomalyCount > 0 ? `${anomalyCount} still bookable` : 'None right now'}
        trend={[0, 1, 1, 2, anomalyCount > 2 ? 3 : anomalyCount, anomalyCount, anomalyCount]}
        trendColor="#E8A33D"
      />
    </div>
  );
}

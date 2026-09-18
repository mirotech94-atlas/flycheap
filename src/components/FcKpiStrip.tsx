import React from 'react';

function FcSparkline({ data, color = '#1f8a5b', width = 64, height = 28 }: {
  data: number[]; color?: string; width?: number; height?: number;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={(data.length - 1) * step}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}

export type FcKpi = {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  accent?: boolean;
  trend?: number[];
  trendColor?: string;
};

export function FcKpiStrip({ items }: { items: FcKpi[] }) {
  return (
    <div className="fc-kpi-strip">
      {items.map((k, i) => (
        <div key={i} className={'fc-kpi' + (k.accent ? ' fc-kpi-accent' : '')}>
          <div className="fc-kpi-label">{k.label}</div>
          <div className="fc-kpi-value">
            {k.value}
            {k.unit && <span className="fc-unit">{k.unit}</span>}
          </div>
          <div className="fc-kpi-sub">{k.sub}</div>
          {k.trend && (
            <div className="fc-kpi-trend">
              <FcSparkline data={k.trend} color={k.accent ? 'var(--nc-amber, #E8A33D)' : (k.trendColor || '#1f8a5b')} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

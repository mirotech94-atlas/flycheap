'use client';

import {
  PieChart, Pie, Cell, Legend, Tooltip,
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { PIE_COLORS, fmtUSD } from '@/lib/utils';

export function PieCard({
  title,
  data,
  valueLabel = 'value',
  format,
}: {
  title: string;
  data: Array<{ name: string; value: number }>;
  valueLabel?: string;
  format?: 'usd' | 'count';
}) {
  const fmt = (n: number) => (format === 'usd' ? fmtUSD(n) : String(n));
  const empty = data.length === 0 || data.every(d => d.value === 0);
  return (
    <div className="card">
      <h2>{title}</h2>
      {empty ? (
        <div className="text-sm text-slate-400 py-8 text-center">No data yet — poll a search first.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={(entry) => entry.name}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => [fmt(v), valueLabel]} />
            <Legend verticalAlign="bottom" height={24} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function PriceHistory({
  data,
  threshold,
}: {
  data: Array<{ polled_at: string; price_per_adult_usd: number }>;
  threshold?: number;
}) {
  if (data.length === 0) {
    return <div className="text-sm text-slate-400 py-6 text-center">No price history yet.</div>;
  }
  const formatted = data.map(d => ({
    t: new Date(d.polled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: Math.round(d.price_per_adult_usd),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={formatted} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="t" tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickFormatter={(v) => fmtUSD(v)}
          domain={['auto', 'auto']}
        />
        <Tooltip formatter={(v: number) => [fmtUSD(v), 'Per adult']} />
        <Line type="monotone" dataKey="price" stroke="#0a3a6b" strokeWidth={2} dot={false} />
        {threshold ? (
          <Line
            type="monotone"
            dataKey={() => threshold}
            stroke="#16a34a"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        ) : null}
      </LineChart>
    </ResponsiveContainer>
  );
}

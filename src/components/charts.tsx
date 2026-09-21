'use client';

import { useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell, Legend, Tooltip,
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { fmtUSD } from '@/lib/utils';

/**
 * The editorial tokens these charts draw with, read from the live cascade
 * rather than hardcoded — so a chart follows the theme like everything else.
 * Read once on mount and re-read whenever `data-theme` flips, the same
 * pattern RouteField.tsx uses for its canvas palette. Renders nothing until
 * the first read succeeds rather than falling back to a hardcoded hex.
 */
type ChartTokens = { grid: string; tick: string; accent: string; amber: string; green: string; muted: string; surface: string };

function useChartTokens(): ChartTokens | null {
  const [tokens, setTokens] = useState<ChartTokens | null>(null);

  useEffect(() => {
    const read = () => {
      const css = getComputedStyle(document.documentElement);
      const grid = css.getPropertyValue('--rule').trim();
      const tick = css.getPropertyValue('--muted-2').trim();
      const accent = css.getPropertyValue('--accent').trim();
      const amber = css.getPropertyValue('--amber').trim();
      const green = css.getPropertyValue('--green').trim();
      const muted = css.getPropertyValue('--muted').trim();
      const surface = css.getPropertyValue('--surface').trim();
      if (!grid || !tick || !accent || !amber || !green || !muted || !surface) return;
      setTokens({ grid, tick, accent, amber, green, muted, surface });
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  return tokens;
}

/** True when the browser can paint an SVG `fill` from a `color-mix()` value. */
const supportsColorMix = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
  && CSS.supports('color', 'color-mix(in srgb, red 60%, blue)');

/**
 * Categorical pie palette, built from tokens at render time instead of a
 * hardcoded hex list — the previous PIE_COLORS (src/lib/utils.ts) led with a
 * retired teal literal, which is what recharts also paints the matching
 * legend item's TEXT in, independent of any wrapper style. Six entries, same
 * shape as the old palette: the four solid tokens, then two tints via
 * `color-mix()` (guarded — falls back to the solid tokens
 * on a browser that can't parse it).
 */
function pieColors(tokens: ChartTokens): string[] {
  const mixAccent = supportsColorMix ? `color-mix(in srgb, ${tokens.accent} 60%, ${tokens.surface})` : tokens.accent;
  const mixAmber = supportsColorMix ? `color-mix(in srgb, ${tokens.amber} 60%, ${tokens.surface})` : tokens.amber;
  return [tokens.accent, tokens.amber, tokens.green, tokens.tick, mixAccent, mixAmber];
}

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
  const tokens = useChartTokens();
  const fmt = (n: number) => (format === 'usd' ? fmtUSD(n) : String(n));
  const empty = data.length === 0 || data.every(d => d.value === 0);
  const colors = tokens ? pieColors(tokens) : [];
  return (
    <div className="ed-panel">
      <h2 className="ed-h2">{title}</h2>
      {empty ? (
        <div className="ed-empty-body" style={{ margin: '32px auto' }}>No data yet — poll a search first.</div>
      ) : !tokens ? null : (
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
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => [fmt(v), valueLabel]}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 0, boxShadow: 'none', color: 'var(--ink)' }}
              itemStyle={{ color: 'var(--ink)' }}
              labelStyle={{ color: 'var(--muted)' }}
            />
            {/* wrapperStyle colours the legend's container, not each item's
                text (recharts paints that in the series colour) — the
                formatter is what actually fixes the 2.34:1 legend. */}
            <Legend
              verticalAlign="bottom"
              height={24}
              wrapperStyle={{ color: tokens.muted }}
              formatter={(value) => <span style={{ color: tokens.muted }}>{value}</span>}
            />
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
  const tokens = useChartTokens();
  if (data.length === 0) {
    return <div className="ed-empty-body" style={{ margin: '24px auto' }}>No price history yet.</div>;
  }
  if (!tokens) return null;
  const formatted = data.map(d => ({
    t: new Date(d.polled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: Math.round(d.price_per_adult_usd),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={formatted} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} />
        <XAxis dataKey="t" tick={{ fontSize: 11, fill: tokens.tick }} />
        <YAxis
          tick={{ fontSize: 11, fill: tokens.tick }}
          tickFormatter={(v) => fmtUSD(v)}
          domain={['auto', 'auto']}
        />
        <Tooltip
          formatter={(v: number) => [fmtUSD(v), 'Per adult']}
          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 0, boxShadow: 'none', color: 'var(--ink)' }}
          itemStyle={{ color: 'var(--ink)' }}
          labelStyle={{ color: 'var(--muted)' }}
        />
        <Line type="monotone" dataKey="price" stroke={tokens.accent} strokeWidth={2} dot={false} />
        {threshold ? (
          <Line
            type="monotone"
            dataKey={() => threshold}
            stroke={tokens.green}
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

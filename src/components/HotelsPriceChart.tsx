'use client';

import { useEffect, useState } from 'react';

type MonthRow = { month: string; label: string; minPrice: number | null; avgPrice: number | null; samples: number };

export function HotelsPriceChart({
  location,
  adults = 2,
  months = 6,
}: {
  location: string;
  adults?: number;
  months?: number;
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading');
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setState('loading');
    setRows([]);
    setErr(null);
    const qs = new URLSearchParams({ location, adults: String(adults), months: String(months) });
    fetch(`/api/hotels/by-month?${qs.toString()}`)
      .then(r => r.json())
      .then(j => {
        if (!alive) return;
        if (j.ok && Array.isArray(j.months)) {
          setRows(j.months);
          setState('ok');
        } else {
          setErr(j.error || 'No data');
          setState('err');
        }
      })
      .catch(e => { if (alive) { setErr(e.message); setState('err'); } });
    return () => { alive = false; };
  }, [location, adults, months]);

  const withData = rows.filter(r => r.minPrice != null);
  const max = Math.max(1, ...withData.map(r => r.minPrice ?? 0));
  const cheapest = withData.slice().sort((a, b) => (a.minPrice ?? 0) - (b.minPrice ?? 0))[0];

  return (
    <div className="ed-panel" style={{ padding: 16 }}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="ed-eyebrow shrink-0">Price by month</span>
          {state === 'ok' && cheapest && (
            <span className="ed-tile-meta truncate" style={{ fontSize: 11 }}>
              cheapest: <span style={{ fontWeight: 600, color: 'var(--green)' }}>{cheapest.label}</span>{' '}
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>${cheapest.minPrice}</span>/adult
            </span>
          )}
        </div>
      </div>

      {state === 'loading' && (
        <div className="grid grid-cols-6 gap-1.5 h-20">
          {Array.from({ length: months }).map((_, i) => (
            <div key={i} className="animate-pulse" style={{ background: 'var(--surface-2)' }} />
          ))}
        </div>
      )}

      {state === 'err' && (
        <div className="py-2" style={{ fontSize: 12, color: 'var(--amber)' }}>
          Couldn&rsquo;t load month curve ({err}).
        </div>
      )}

      {state === 'ok' && (
        <div className="grid gap-1.5 items-end" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`, height: 88 }}>
          {rows.map(r => {
            const pct = r.minPrice ? (r.minPrice / max) * 100 : 0;
            const isCheapest = cheapest && r.month === cheapest.month;
            return (
              <div key={r.month} className="flex flex-col h-full items-center justify-end gap-0.5 text-center">
                <div
                  className="tabular"
                  style={{ fontSize: 9, fontWeight: 600, color: isCheapest ? 'var(--green)' : 'var(--muted)' }}
                >
                  {r.minPrice != null ? `$${r.minPrice}` : '—'}
                </div>
                <div
                  className="w-full transition-all"
                  style={{
                    height: `${Math.max(4, pct)}%`,
                    background: isCheapest ? 'var(--green)' : 'var(--track)',
                  }}
                  title={r.minPrice
                    ? `${r.label}: min $${r.minPrice}, avg $${r.avgPrice}, ${r.samples} sampled`
                    : `${r.label}: no data`}
                />
                <div style={{ fontSize: 9, color: 'var(--muted)' }}>{r.label}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

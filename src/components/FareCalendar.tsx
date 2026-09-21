import type { CSSProperties } from 'react';
import { fmtUSD } from '@/lib/utils';

type Deal = {
  origin: string;
  outbound_date: string;
  per_adult_usd: number;
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthKey(year: number, month0: number) {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

/**
 * 4 bands on tokens only (well-below/at-target read as --green, above-target
 * as --amber — a fare signal, so amber is legitimate here per the "amber is
 * for fares" rule — and above-cap as --red). The original Tailwind palette
 * had 6 stops (a separate "orange" tier); the token set has green/amber/red
 * only, so the two above-target tiers and the two red tiers each collapse
 * into one — still communicates the same low→high gradient.
 */
function colorBand(price: number, threshold: number, maxDisplay: number): CSSProperties {
  const range = Math.max(1, maxDisplay - threshold);
  if (price <= threshold - range * 0.20) {
    return { background: 'var(--green)', color: 'var(--on-accent)' };
  }
  if (price <= threshold) {
    // Same 8%-tint/75%-ink-mix recipe as .ed-chip.status-ok (≥6.2:1 both themes).
    return { background: 'color-mix(in srgb, var(--green) 8%, var(--surface))', color: 'color-mix(in srgb, var(--green) 75%, var(--ink))' };
  }
  const above = (price - threshold) / range;
  if (above <= 1.0) {
    // Same 8%-tint/65%-ink-mix recipe as .ed-chip.status-waiting (≥5:1 both themes).
    return { background: 'color-mix(in srgb, var(--amber) 8%, var(--surface))', color: 'color-mix(in srgb, var(--amber) 65%, var(--ink))' };
  }
  return { background: 'var(--red)', color: 'var(--on-accent)' };
}

export function FareCalendar({
  deals,
  threshold,
  maxDisplay,
  monthsAhead = 12,
}: {
  deals: Deal[];
  threshold: number;
  maxDisplay: number;
  monthsAhead?: number;
}) {
  // Aggregate: for each departure YYYY-MM-DD, keep cheapest per-adult fare and the origin.
  const byDate = new Map<string, { price: number; origin: string }>();
  for (const d of deals) {
    const key = d.outbound_date.slice(0, 10);
    const cur = byDate.get(key);
    if (!cur || d.per_adult_usd < cur.price) {
      byDate.set(key, { price: d.per_adult_usd, origin: d.origin });
    }
  }

  // Build rows for next N months starting current month.
  const now = new Date();
  const rows: { label: string; year: number; month0: number; days: number }[] = [];
  for (let i = 0; i < monthsAhead; i++) {
    const m = now.getUTCMonth() + i;
    const year = now.getUTCFullYear() + Math.floor(m / 12);
    const month0 = ((m % 12) + 12) % 12;
    rows.push({
      label: `${MONTH_NAMES[month0]} ${year}`,
      year, month0,
      days: new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate(),
    });
  }

  const allPrices = Array.from(byDate.values()).map(v => v.price);
  const cheapest = allPrices.length ? Math.min(...allPrices) : null;

  return (
    <div className="ed-panel" style={{ overflowX: 'auto' }}>
      <div className="ed-panel-head">
        <div>
          <div className="ed-eyebrow">Fare heatmap</div>
          <h2 className="ed-panel-title">Cheapest departure-day fare · next {monthsAhead} months</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 11 }}>
          <span style={{ color: 'var(--muted)', marginRight: 4 }}>Cheaper</span>
          <span style={{ width: 16, height: 16, background: 'var(--green)' }} title="≥ 20% below target" />
          <span style={{ width: 16, height: 16, background: 'color-mix(in srgb, var(--green) 8%, var(--surface))' }} title="At/below target" />
          <span style={{ width: 16, height: 16, background: 'color-mix(in srgb, var(--amber) 8%, var(--surface))' }} title="Above target" />
          <span style={{ width: 16, height: 16, background: 'var(--red)' }} title="Above cap" />
          <span style={{ color: 'var(--muted)', marginLeft: 4 }}>Pricier</span>
        </div>
      </div>

      <div className="ed-panel-note" style={{ marginBottom: 14 }}>
        Each cell = the cheapest cached EgyptAir per-adult fare departing that day from JFK or EWR.
        Empty = no fare cached for that date. Target {fmtUSD(threshold)} · cap {fmtUSD(maxDisplay)}
        {cheapest != null && <> · <span style={{ fontWeight: 600, color: 'var(--green)' }}>overall low {fmtUSD(cheapest)}</span></>}.
      </div>

      <div style={{ minWidth: 860 }}>
        {/* Day-of-month header */}
        <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: '92px repeat(31, minmax(0, 1fr))', fontSize: 10, color: 'var(--muted-2)' }}>
          <div></div>
          {Array.from({ length: 31 }, (_, i) => (
            <div key={i} className="text-center">{i + 1}</div>
          ))}
        </div>

        {rows.map(r => (
          <div
            key={`${r.year}-${r.month0}`}
            className="grid gap-1 mb-1 items-center"
            style={{ gridTemplateColumns: '92px repeat(31, minmax(0, 1fr))' }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', paddingRight: 8, textAlign: 'right' }}>
              {r.label}
            </div>
            {Array.from({ length: 31 }, (_, i) => {
              const day = i + 1;
              if (day > r.days) return <div key={i} />;
              const dateKey = `${r.year}-${String(r.month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const entry = byDate.get(dateKey);
              if (!entry) {
                return (
                  <div
                    key={i}
                    className="aspect-square"
                    style={{ background: 'var(--surface-2)' }}
                    title={`${dateKey} — no data`}
                  />
                );
              }
              const style = colorBand(entry.price, threshold, maxDisplay);
              return (
                <a
                  key={i}
                  href={`/?outbound=${monthKey(r.year, r.month0)}&origin=${entry.origin}`}
                  className="ed-fare-cell aspect-square flex items-center justify-center"
                  style={{ ...style, fontSize: 9, fontWeight: 700 }}
                  title={`${dateKey} · ${entry.origin} → CAI · ${fmtUSD(entry.price)}/adult`}
                >
                  {Math.round(entry.price / 100)}
                </a>
              );
            })}
          </div>
        ))}
      </div>

      <div className="ed-panel-note" style={{ marginTop: 8 }}>
        Numbers in cells are price ÷ 100 (e.g. "9" ≈ $900). Click any day → filter the deals table to that month + origin.
      </div>
    </div>
  );
}

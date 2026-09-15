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

function colorBand(price: number, threshold: number, maxDisplay: number): string {
  // 5 bands: deep green (well below) → green → amber → orange → red (above cap)
  const range = Math.max(1, maxDisplay - threshold);
  if (price <= threshold - range * 0.20) return 'bg-emerald-500/90 text-white';
  if (price <= threshold)               return 'bg-emerald-300 text-emerald-950';
  const above = (price - threshold) / range;
  if (above <= 0.33) return 'bg-amber-200 text-amber-900';
  if (above <= 0.66) return 'bg-orange-300 text-orange-950';
  if (above <= 1.0)  return 'bg-red-300 text-red-950';
  return 'bg-red-500/90 text-white';
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
    <div className="card overflow-x-auto">
      <div className="card-head">
        <div>
          <div className="eyebrow text-brand-600">Fare heatmap</div>
          <h2 className="!mb-0">Cheapest departure-day fare · next {monthsAhead} months</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px] tabular">
          <span className="text-slate-500 mr-1">Cheaper</span>
          <span className="w-4 h-4 rounded bg-emerald-500/90" title="≥ 20% below target" />
          <span className="w-4 h-4 rounded bg-emerald-300" title="At/below target" />
          <span className="w-4 h-4 rounded bg-amber-200" title="Slightly above" />
          <span className="w-4 h-4 rounded bg-orange-300" title="Notably above" />
          <span className="w-4 h-4 rounded bg-red-300" title="Near cap" />
          <span className="w-4 h-4 rounded bg-red-500/90" title="Above cap" />
          <span className="text-slate-500 ml-1">Pricier</span>
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-3">
        Each cell = the cheapest cached EgyptAir per-adult fare departing that day from JFK or EWR.
        Empty = no fare cached for that date. Target {fmtUSD(threshold)} · cap {fmtUSD(maxDisplay)}
        {cheapest != null && <> · <span className="font-semibold text-emerald-700">overall low {fmtUSD(cheapest)}</span></>}.
      </div>

      <div className="min-w-[860px]">
        {/* Day-of-month header */}
        <div className="grid gap-1 mb-1 text-[10px] text-slate-400 tabular" style={{ gridTemplateColumns: '92px repeat(31, minmax(0, 1fr))' }}>
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
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 pr-2 text-right">
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
                    className="aspect-square rounded-[5px] bg-slate-100 dark:bg-slate-800/60 border border-transparent"
                    title={`${dateKey} — no data`}
                  />
                );
              }
              const cls = colorBand(entry.price, threshold, maxDisplay);
              return (
                <a
                  key={i}
                  href={`/?outbound=${monthKey(r.year, r.month0)}&origin=${entry.origin}`}
                  className={`aspect-square rounded-[5px] ${cls} flex items-center justify-center text-[9px] font-bold tabular hover:ring-2 hover:ring-brand/60 hover:scale-110 transition-transform`}
                  title={`${dateKey} · ${entry.origin} → CAI · ${fmtUSD(entry.price)}/adult`}
                >
                  {Math.round(entry.price / 100)}
                </a>
              );
            })}
          </div>
        ))}
      </div>

      <div className="text-[10px] text-slate-400 mt-2">
        Numbers in cells are price ÷ 100 (e.g. "9" ≈ $900). Click any day → filter the deals table to that month + origin.
      </div>
    </div>
  );
}

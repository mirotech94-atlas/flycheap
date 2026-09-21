'use client';
import { useMemo, useState } from 'react';

export type FcFareDeal = {
  origin: string;
  destination?: string;
  outbound_date: string;
  per_adult_usd: number;
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function levelFor(price: number | undefined, threshold: number, maxDisplay: number): number {
  if (price === undefined) return -1;
  const range = Math.max(1, maxDisplay - threshold);
  if (price <= threshold - range * 0.20) return 5;
  if (price <= threshold) return 4;
  const above = (price - threshold) / range;
  if (above <= 0.33) return 3;
  if (above <= 0.66) return 2;
  if (above <= 1.0)  return 1;
  return 0;
}

function dayDiff(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
}

export function FcFareCalendar({
  deals = [],
  threshold = 900,
  maxDisplay = 1200,
  origin: initialOrigin = 'JFK',
  dest: initialDest = 'CAI',
  routes = [],
}: {
  deals?: FcFareDeal[];
  threshold?: number;
  maxDisplay?: number;
  origin?: string;
  dest?: string;
  routes?: Array<{ origin: string; destination: string }>;
}) {
  // Route is local state — switching re-filters the passed-in deal set without
  // a page reload (the dashboard passes deals for ALL routes).
  const [origin, setOrigin] = useState(initialOrigin);
  const [dest, setDest] = useState(initialDest);
  const [routeOpen, setRouteOpen] = useState(false);

  // Filter to the selected route when destination data is present.
  const filteredDeals = useMemo(() => {
    if (!deals.length) return deals;
    const hasDest = deals.some(d => d.destination);
    if (!hasDest) return deals;
    return deals.filter(d => d.origin === origin && (d.destination || dest) === dest);
  }, [deals, origin, dest]);

  // Months: always browsable 12 months ahead, plus any data months beyond that.
  const months = useMemo(() => {
    const set = new Set<string>();
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const m = now.getUTCMonth() + i;
      const y = now.getUTCFullYear() + Math.floor(m / 12);
      set.add(`${y}-${String((m % 12) + 1).padStart(2, '0')}`);
    }
    for (const d of filteredDeals) set.add(d.outbound_date.slice(0, 7));
    return [...set].sort();
  }, [filteredDeals]);

  const dayPrice = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of filteredDeals) {
      const cur = m.get(d.outbound_date);
      if (cur === undefined || d.per_adult_usd < cur) m.set(d.outbound_date, d.per_adult_usd);
    }
    return m;
  }, [filteredDeals]);

  const [monthIdx, setMonthIdx] = useState(0);
  const ym = months[Math.min(monthIdx, months.length - 1)];
  const [yStr, mStr] = ym.split('-');
  const year = Number(yStr);
  const m0 = Number(mStr) - 1;
  const first = new Date(Date.UTC(year, m0, 1));
  const daysInMonth = new Date(Date.UTC(year, m0 + 1, 0)).getUTCDate();
  const startDow = first.getUTCDay();

  const monthMin = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of filteredDeals) {
      const k = d.outbound_date.slice(0, 7);
      if (out[k] === undefined || d.per_adult_usd < out[k]) out[k] = d.per_adult_usd;
    }
    return out;
  }, [filteredDeals]);
  const prevYm = months[Math.max(0, monthIdx - 1)] ?? ym;
  const currMin = monthMin[ym];
  const prevMin = monthMin[prevYm];
  const deltaPct = (currMin && prevMin && currMin !== prevMin) ? Math.round(((currMin - prevMin) / prevMin) * 100) : null;

  // ---- Click-click range selection (spans months) ----
  // First click = departure. Second click = return, even in a different month —
  // navigate with ‹ › mid-selection for month-long+ trips. Book → /offers runs a
  // LIVE search there, so any date window works even when no cached fare exists.
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  function onDayClick(dateKey: string) {
    if (!selStart || (selStart && selEnd)) {
      setSelStart(dateKey); setSelEnd(null);
      return;
    }
    if (dateKey === selStart) { setSelStart(null); setSelEnd(null); return; }
    if (dateKey < selStart) { setSelStart(dateKey); setSelEnd(null); return; }
    setSelEnd(dateKey);
  }

  function inRange(dateKey: string): boolean {
    const end = selEnd ?? (selStart && hoverDate && hoverDate > selStart ? hoverDate : null);
    if (!selStart || !end) return dateKey === selStart;
    return dateKey >= selStart && dateKey <= end;
  }

  function bookSelection() {
    if (!selStart || !selEnd) return;
    const params = new URLSearchParams({
      origin, destination: dest,
      departDate: selStart, returnDate: selEnd,
    });
    window.location.href = `/offers?${params.toString()}`;
  }

  function switchRoute(o: string, d: string) {
    setOrigin(o); setDest(d);
    setRouteOpen(false);
    setSelStart(null); setSelEnd(null);
    setMonthIdx(0);
  }

  type Cell = { empty: true; k: string } | { empty?: false; d: number; lvl: number; price?: number; mistake?: boolean; k: string; dateKey: string };
  const cells: Cell[] = [];
  for (let i = 0; i < startDow; i++) cells.push({ empty: true, k: 'e' + i });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const price = dayPrice.get(dateKey);
    const lvl = levelFor(price, threshold, maxDisplay);
    const fcLvl = lvl < 0 ? 0 : lvl;
    const mistake = price !== undefined && price < threshold * 0.7;
    cells.push({ d, lvl: fcLvl, price, mistake, k: 'd' + d, dateKey });
  }

  const monthLabel = `${MONTH_NAMES[m0]} ${year}`;
  const tripDays = selStart && selEnd ? dayDiff(selStart, selEnd) : null;

  return (
    <div className="fc-card" style={{ position: 'relative' }}>
      <div className="fc-card-head">
        <div>
          <div className="fc-smallcaps">Cheap-window heatmap</div>
          <h2 className="fc-card-title">Fare <em>calendar</em></h2>
          <div className="fc-card-meta">
            {origin} → {dest} · click depart, then return — any length, any month
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
          {routes.length > 1 && (
            <>
              <button
                className="fc-btn fc-btn-light fc-btn-sm"
                onClick={() => setRouteOpen(o => !o)}
                title="Switch route"
              >Route ▾</button>
              {routeOpen && (
                <div
                  style={{
                    position: 'absolute', top: '110%', right: 0, zIndex: 30,
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    border: '1px solid var(--rule-strong)',
                    borderRadius: 0,
                    minWidth: 160, padding: 4, maxHeight: 280, overflowY: 'auto',
                  }}
                  onMouseLeave={() => setRouteOpen(false)}
                >
                  {routes.map(r => {
                    const active = r.origin === origin && r.destination === dest;
                    return (
                      <button
                        key={`${r.origin}-${r.destination}`}
                        type="button"
                        onClick={() => switchRoute(r.origin, r.destination)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '6px 10px', fontSize: 13, borderRadius: 0,
                          background: active ? 'color-mix(in srgb, var(--amber) 18%, transparent)' : 'transparent',
                          fontFamily: 'var(--font-mono)', border: 'none', cursor: 'pointer',
                          color: 'var(--ink)',
                        }}
                      >{r.origin} → {r.destination}</button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          <button className="fc-btn fc-btn-light fc-btn-sm" disabled={monthIdx === 0} onClick={() => setMonthIdx(i => Math.max(0, i - 1))}>‹</button>
          <button className="fc-btn fc-btn-light fc-btn-sm" disabled={monthIdx >= months.length - 1} onClick={() => setMonthIdx(i => Math.min(months.length - 1, i + 1))}>›</button>
        </div>
      </div>
      <div className="fc-cal">
        <div className="fc-cal-month">
          <span>{monthLabel}</span>
          {deltaPct !== null && (
            <span className="fc-mono" style={{ fontSize: 9, color: deltaPct <= 0 ? 'var(--green)' : 'var(--red)' }}>
              {deltaPct <= 0 ? '▼' : '▲'} {Math.abs(deltaPct)}% vs {MONTH_NAMES[(m0 + 11) % 12]}
            </span>
          )}
        </div>
        <div className="fc-cal-grid" style={{ userSelect: 'none' }}>
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
            <div key={d} className="fc-cal-dow">{d}</div>
          ))}
          {cells.map(c => c.empty ? (
            <div key={c.k} style={{ aspectRatio: '1' }} />
          ) : (
            <div
              key={c.k}
              className={'fc-cal-cell l' + c.lvl}
              title={c.price !== undefined ? `Day ${c.d} — $${Math.round(c.price)}` : `Day ${c.d} — live search on booking`}
              onClick={() => onDayClick(c.dateKey)}
              onMouseEnter={() => setHoverDate(c.dateKey)}
              style={inRange(c.dateKey) ? {
                outline: '2px solid var(--amber)',
                background: 'color-mix(in srgb, var(--amber) 22%, transparent)',
                cursor: 'pointer',
              } : { cursor: 'pointer' }}
            >
              {c.d}{c.mistake && <span style={{ marginLeft: 2 }}>✦</span>}
            </div>
          ))}
        </div>
        <div className="fc-cal-legend">
          <span>Cheap</span>
          <div className="swatches">
            {[0,1,2,3,4,5].map(l => <div key={l} className={'sw fc-cal-cell l' + l} style={{ width: 14, height: 14 }} />)}
          </div>
          <span style={{ marginLeft: 'auto' }}>✦ Mistake fare alert</span>
        </div>
      </div>

      {/* Selection bar — persists across month navigation so long trips work */}
      {selStart && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            margin: '0 24px 18px', padding: '8px 14px',
            background: 'color-mix(in srgb, var(--amber) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--amber) 45%, transparent)',
            borderRadius: 0,
            fontFamily: 'var(--font-mono)', fontSize: 12,
          }}
        >
          <span>
            {selStart} → {selEnd ?? 'pick return date (use › for later months)'}
            {tripDays !== null && <strong style={{ marginLeft: 6 }}>· {tripDays} days</strong>}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {selEnd && (
              <button className="fc-btn fc-btn-gold fc-btn-sm" onClick={bookSelection}>
                Book this window →
              </button>
            )}
            <button className="fc-btn fc-btn-light fc-btn-sm" onClick={() => { setSelStart(null); setSelEnd(null); }}>
              Clear
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

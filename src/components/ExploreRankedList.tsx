'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { fmtUSD, fmtDate } from '@/lib/utils';
import { BookButton } from '@/components/BookButton';

/**
 * Skyscanner "Everywhere" pattern for /explore: every destination the page
 * already fetched (hot deals + city-directions), ranked by price, with
 * trip-length and month filters and a list / map toggle. Purely client-side
 * over data the server component passes in — no extra provider calls.
 */
export type ExploreOption = {
  destination: string;
  city: string;
  price: number;
  depart: string;          // YYYY-MM-DD
  ret: string | null;      // YYYY-MM-DD
  nights: number | null;
  stops: number | null;
  airline?: string | null;
};

type TripLen = 'any' | 'weekend' | 'week' | 'fortnight';
const TRIP_LENGTHS: Array<{ id: TripLen; label: string; test: (n: number | null) => boolean }> = [
  { id: 'any',       label: 'Any length',   test: () => true },
  { id: 'weekend',   label: 'Weekend',      test: n => n != null && n >= 2 && n <= 4 },
  { id: 'week',      label: '1 week',       test: n => n != null && n >= 5 && n <= 9 },
  { id: 'fortnight', label: '2 weeks',      test: n => n != null && n >= 10 && n <= 16 },
];

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

const chip = (active: boolean) => `ed-chip${active ? ' active' : ''}`;

export function ExploreRankedList({
  origin,
  originCity,
  options,
  mapSlot,
}: {
  origin: string;
  originCity: string;
  options: ExploreOption[];
  /** Server-rendered map element; shown when the toggle is on "Map". */
  mapSlot: ReactNode;
}) {
  const [view, setView] = useState<'list' | 'map'>('list');
  const [tripLen, setTripLen] = useState<TripLen>('any');
  const [month, setMonth] = useState<string>('any');

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const o of options) if (o.depart) set.add(o.depart.slice(0, 7));
    return [...set].sort();
  }, [options]);

  const ranked = useMemo(() => {
    const lenTest = TRIP_LENGTHS.find(t => t.id === tripLen)?.test ?? (() => true);
    const best = new Map<string, ExploreOption>();
    for (const o of options) {
      if (!lenTest(o.nights)) continue;
      if (month !== 'any' && o.depart.slice(0, 7) !== month) continue;
      const cur = best.get(o.destination);
      if (!cur || o.price < cur.price) best.set(o.destination, o);
    }
    return [...best.values()].sort((a, b) => a.price - b.price);
  }, [options, tripLen, month]);

  const cheapest = ranked[0]?.price ?? null;

  return (
    <div>
      {/* Toolbar: filters + view toggle. Bordered on its own; the list body
          below sits flush against its bottom edge (no border-top, so the
          rule isn't doubled), while the map slot (SatelliteExploreMap, which
          carries its own `1px solid var(--rule)` box) renders separately
          below with a gap instead of touching it. */}
      <div style={{ border: '1px solid var(--rule)', padding: '12px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="ed-mono" style={{ color: 'var(--muted-2)', marginRight: 4 }}>Trip</span>
          {TRIP_LENGTHS.map(t => (
            <button key={t.id} type="button" className={chip(tripLen === t.id)} onClick={() => setTripLen(t.id)} aria-pressed={tripLen === t.id}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="ed-mono" style={{ color: 'var(--muted-2)', marginRight: 4 }}>Month</span>
          <button type="button" className={chip(month === 'any')} onClick={() => setMonth('any')} aria-pressed={month === 'any'}>Any</button>
          {months.slice(0, 8).map(m => (
            <button key={m} type="button" className={chip(month === m)} onClick={() => setMonth(m)} aria-pressed={month === m}>
              {monthLabel(m)}
            </button>
          ))}
          {months.length > 8 && (
            <select
              value={months.slice(0, 8).includes(month) ? 'more' : month}
              onChange={e => setMonth(e.target.value)}
              className="ed-chip"
              aria-label="More months"
            >
              <option value="more">More…</option>
              {months.slice(8).map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          )}
        </div>
        <div className="ed-seg" style={{ marginLeft: 'auto' }} role="tablist" aria-label="View">
          {(['list', 'map'] as const).map(v => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`ed-seg-btn${view === v ? ' active' : ''}`}
            >
              {v === 'list' ? '☰ List' : '◎ Map'}
            </button>
          ))}
        </div>
      </div>

      {view === 'map' ? (
        <div style={{ marginTop: 16 }}>{mapSlot}</div>
      ) : (
        <div className="overflow-x-auto" style={{ border: '1px solid var(--rule)', borderTop: 'none', padding: '0 20px 8px' }}>
          <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--muted)' }}>
            {ranked.length} destination{ranked.length !== 1 ? 's' : ''} from {originCity}
            {cheapest != null && <> · from <span className="ed-mono" style={{ fontWeight: 600, color: 'var(--ink)', textTransform: 'none', letterSpacing: 0 }}>{fmtUSD(cheapest)}</span></>}
            {(tripLen !== 'any' || month !== 'any') && (
              <button type="button" style={{ marginLeft: 8, textDecoration: 'underline', color: 'var(--muted)' }} onClick={() => { setTripLen('any'); setMonth('any'); }}>
                clear filters
              </button>
            )}
          </div>
          {ranked.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '40px 0' }}>
              Nothing cached for that trip length / month from {origin}. Try another filter.
            </div>
          ) : (
            <table className="ed-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Destination</th>
                  <th>Dates</th>
                  <th>Length</th>
                  <th>Stops</th>
                  <th className="num">Round-trip</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((o, i) => {
                  const ret = o.ret ?? new Date(new Date(o.depart).getTime() + 7 * 86400000).toISOString().slice(0, 10);
                  const hot = cheapest != null && o.price <= cheapest * 1.15;
                  return (
                    <tr key={o.destination} className={hot ? 'hot' : undefined}>
                      <td className="ed-mono" style={{ color: 'var(--muted-2)', textTransform: 'none', letterSpacing: 0 }}>{i + 1}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{o.city}</span>
                        <span className="ed-mono" style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted-2)' }}>{o.destination}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {fmtDate(o.depart)}{o.ret ? ` → ${fmtDate(o.ret)}` : ''}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{o.nights != null ? `${o.nights} nights` : <span style={{ color: 'var(--muted-2)' }}>—</span>}</td>
                      <td>
                        {o.stops === 0
                          ? <><span className="ed-dot" /> <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>nonstop</span></>
                          : o.stops != null
                            ? <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{o.stops} stop{o.stops > 1 ? 's' : ''}</span>
                            : <span style={{ color: 'var(--muted-2)' }}>—</span>}
                      </td>
                      <td className="num" style={{ whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--ink)' }}>{fmtUSD(o.price)}</td>
                      <td className="cta">
                        <BookButton
                          origin={origin}
                          destination={o.destination}
                          departDate={o.depart}
                          returnDate={ret}
                          adults={1}
                          infants={0}
                          size="sm"
                          perAdultUsd={o.price}
                          surface="explore-page"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

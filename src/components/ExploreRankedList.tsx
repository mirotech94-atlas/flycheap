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

const chip = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-medium transition border ${
    active
      ? 'bg-[#0a3a6b] text-white border-[#0a3a6b]'
      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#d4af37]'
  }`;

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
    <div className="card !p-0 overflow-hidden">
      {/* Toolbar: filters + view toggle */}
      <div className="px-4 md:px-5 py-3 border-b border-slate-200/60 dark:border-slate-700/60 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-400 mr-1">Trip</span>
          {TRIP_LENGTHS.map(t => (
            <button key={t.id} type="button" className={chip(tripLen === t.id)} onClick={() => setTripLen(t.id)} aria-pressed={tripLen === t.id}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-400 mr-1">Month</span>
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
              className="text-xs rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
              aria-label="More months"
            >
              <option value="more">More…</option>
              {months.slice(8).map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          )}
        </div>
        <div className="ml-auto inline-flex rounded-full border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-900" role="tablist" aria-label="View">
          {(['list', 'map'] as const).map(v => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${view === v ? 'bg-[#d4af37] text-[#0a3a6b]' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              {v === 'list' ? '☰ List' : '◎ Map'}
            </button>
          ))}
        </div>
      </div>

      {view === 'map' ? (
        <div>{mapSlot}</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="px-4 md:px-5 pt-3 text-xs text-slate-500">
            {ranked.length} destination{ranked.length !== 1 ? 's' : ''} from {originCity}
            {cheapest != null && <> · from <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular">{fmtUSD(cheapest)}</span></>}
            {(tripLen !== 'any' || month !== 'any') && (
              <button type="button" className="ml-2 underline hover:text-slate-800 dark:hover:text-slate-200" onClick={() => { setTripLen('any'); setMonth('any'); }}>
                clear filters
              </button>
            )}
          </div>
          {ranked.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-10">
              Nothing cached for that trip length / month from {origin}. Try another filter.
            </div>
          ) : (
            <table className="fmt">
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Destination</th>
                  <th>Dates</th>
                  <th>Length</th>
                  <th>Stops</th>
                  <th className="text-right">Round-trip</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((o, i) => {
                  const ret = o.ret ?? new Date(new Date(o.depart).getTime() + 7 * 86400000).toISOString().slice(0, 10);
                  const hot = cheapest != null && o.price <= cheapest * 1.15;
                  return (
                    <tr key={o.destination} className={hot ? 'row-hot' : undefined}>
                      <td className="text-slate-400 font-mono">{i + 1}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-semibold text-slate-900 dark:text-white">{o.city}</span>
                        <span className="ml-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">{o.destination}</span>
                      </td>
                      <td className="text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {fmtDate(o.depart)}{o.ret ? ` → ${fmtDate(o.ret)}` : ''}
                      </td>
                      <td className="whitespace-nowrap">{o.nights != null ? `${o.nights} nights` : <span className="text-slate-400">—</span>}</td>
                      <td>
                        {o.stops === 0
                          ? <span className="badge badge-ok text-[9px]">nonstop</span>
                          : o.stops != null
                            ? <span className="badge badge-muted text-[9px]">{o.stops} stop{o.stops > 1 ? 's' : ''}</span>
                            : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="text-right font-bold tabular whitespace-nowrap text-emerald-700 dark:text-emerald-400">{fmtUSD(o.price)}</td>
                      <td className="text-right">
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

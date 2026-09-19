'use client';

import { useEffect, useState } from 'react';
import { loadPins, savePins, PIN_EVENT, type PinnedDeal } from '@/lib/pinned';
import { fmtUSD, fmtDate } from '@/lib/utils';
import { BookingActions } from './BookingActions';

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function CompareTray() {
  const [pins, setPins] = useState<PinnedDeal[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setPins(loadPins());
    refresh();
    window.addEventListener(PIN_EVENT, refresh);
    return () => window.removeEventListener(PIN_EVENT, refresh);
  }, []);

  if (pins.length === 0) return null;

  const cheapest = Math.min(...pins.map(p => p.per_adult_usd));

  function unpin(key: string) {
    savePins(pins.filter(p => p.key !== key));
  }
  function clearAll() { savePins([]); }

  return (
    <>
      {/* Floating launcher pill — always visible when there are pins */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-30 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand text-white shadow-lift hover:bg-brand-600 transition no-print"
      >
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--nc-teal)] text-[var(--nc-dark)] text-xs font-bold">
          {pins.length}
        </span>
        <span className="text-sm font-semibold">Compare pinned</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center no-print" role="dialog">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white dark:bg-slate-900 w-full md:max-w-5xl md:rounded-2xl rounded-t-2xl shadow-lift border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-gradient-to-r from-brand-700 to-brand-500 text-white px-5 py-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-white/70 font-semibold">Side-by-side</div>
                <h3 className="font-display font-bold text-lg leading-tight">Pinned deal comparison</h3>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={clearAll} className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" title="Unpin all">Clear</button>
                <button onClick={() => setOpen(false)} className="text-xl leading-none px-2 hover:text-white/80" aria-label="Close">×</button>
              </div>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              {pins.map(p => {
                const isCheapest = p.per_adult_usd === cheapest;
                return (
                  <div key={p.key} className={`relative rounded-xl border p-4 ${isCheapest ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/10' : 'border-slate-200 dark:border-slate-700'}`}>
                    {isCheapest && pins.length > 1 && (
                      <div className="absolute -top-2 left-3 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded">
                        Cheapest
                      </div>
                    )}
                    <button
                      onClick={() => unpin(p.key)}
                      className="absolute top-2 right-2 text-slate-400 hover:text-red-500 text-sm"
                      title="Unpin"
                    >×</button>
                    <div className="text-xs text-slate-500">{p.origin} → CAI</div>
                    <div className="text-3xl font-bold tabular text-slate-900 dark:text-white mt-1">{fmtUSD(p.per_adult_usd)}<span className="text-xs font-normal text-slate-400">/adult</span></div>
                    <dl className="mt-3 space-y-1.5 text-sm">
                      <div className="flex justify-between gap-4"><dt className="text-slate-500">Depart</dt><dd className="tabular">{fmtDate(p.outbound_date)} · {DOW[p.outbound_dow]} {String(p.outbound_hour).padStart(2,'0')}:00</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-500">Return</dt><dd className="tabular">{fmtDate(p.return_date)} · {DOW[p.return_dow]} {String(p.return_hour).padStart(2,'0')}:00</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-500">Trip</dt><dd className="tabular">{p.trip_length_days} days</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-500">Flights</dt><dd className="font-mono text-xs">{p.outbound_flight_no} / {p.return_flight_no}</dd></div>
                      <div className="flex justify-between gap-4 pt-2 border-t border-slate-200/60 dark:border-slate-700"><dt className="text-slate-500">Party total</dt><dd className="font-bold tabular">{fmtUSD(p.party_total_usd)}</dd></div>
                      {!isCheapest && (
                        <div className="flex justify-between gap-4 text-xs"><dt className="text-slate-400">vs cheapest pinned</dt><dd className="tabular text-red-600 font-semibold">+{fmtUSD(p.per_adult_usd - cheapest)}/ad</dd></div>
                      )}
                    </dl>
                    <div className="mt-3">
                      <BookingActions
                        origin={p.origin} destination="CAI"
                        departDate={p.outbound_date} returnDate={p.return_date}
                        adults={4} infants={1}
                        size="sm"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

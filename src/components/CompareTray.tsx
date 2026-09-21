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
        className="ed-tray-launcher fixed bottom-6 left-6 z-30 no-print"
      >
        <span className="ed-tray-count">
          {pins.length}
        </span>
        <span>Compare pinned</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center no-print" role="dialog">
          <div className="ed-tray-overlay" onClick={() => setOpen(false)} />
          <div className="ed-tray-panel w-full md:max-w-5xl max-h-[90vh] overflow-auto">
            <div className="ed-tray-head">
              <div>
                <div className="ed-tray-head-eyebrow">Side-by-side</div>
                <h3 className="ed-tray-head-title">Pinned deal comparison</h3>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={clearAll} className="ed-tray-head-btn" title="Unpin all">Clear</button>
                <button onClick={() => setOpen(false)} className="ed-tray-close" aria-label="Close">×</button>
              </div>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              {pins.map(p => {
                const isCheapest = p.per_adult_usd === cheapest;
                return (
                  <div key={p.key} className={`ed-tray-card ${isCheapest ? 'cheapest' : ''}`}>
                    {isCheapest && pins.length > 1 && (
                      <div className="ed-tray-badge">
                        Cheapest
                      </div>
                    )}
                    <button
                      onClick={() => unpin(p.key)}
                      className="ed-tray-unpin"
                      title="Unpin"
                    >×</button>
                    <div className="ed-eyebrow" style={{ fontWeight: 500, letterSpacing: 0, textTransform: 'none', fontSize: 12 }}>{p.origin} → CAI</div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 30, letterSpacing: '-0.02em', color: 'var(--ink)', marginTop: 4 }} className="tabular">{fmtUSD(p.per_adult_usd)}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted-2)' }}>/adult</span></div>
                    <dl className="mt-3 space-y-1.5 text-sm">
                      <div className="flex justify-between gap-4"><dt style={{ color: 'var(--muted)' }}>Depart</dt><dd className="tabular">{fmtDate(p.outbound_date)} · {DOW[p.outbound_dow]} {String(p.outbound_hour).padStart(2,'0')}:00</dd></div>
                      <div className="flex justify-between gap-4"><dt style={{ color: 'var(--muted)' }}>Return</dt><dd className="tabular">{fmtDate(p.return_date)} · {DOW[p.return_dow]} {String(p.return_hour).padStart(2,'0')}:00</dd></div>
                      <div className="flex justify-between gap-4"><dt style={{ color: 'var(--muted)' }}>Trip</dt><dd className="tabular">{p.trip_length_days} days</dd></div>
                      <div className="flex justify-between gap-4"><dt style={{ color: 'var(--muted)' }}>Flights</dt><dd className="ed-mono" style={{ letterSpacing: 0, textTransform: 'none', fontSize: 11 }}>{p.outbound_flight_no} / {p.return_flight_no}</dd></div>
                      <div className="flex justify-between gap-4 pt-2" style={{ borderTop: '1px solid var(--rule-soft)' }}><dt style={{ color: 'var(--muted)' }}>Party total</dt><dd className="font-bold tabular">{fmtUSD(p.party_total_usd)}</dd></div>
                      {!isCheapest && (
                        <div className="flex justify-between gap-4 text-xs"><dt style={{ color: 'var(--muted-2)' }}>vs cheapest pinned</dt><dd className="tabular font-semibold" style={{ color: 'var(--red)' }}>+{fmtUSD(p.per_adult_usd - cheapest)}/ad</dd></div>
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

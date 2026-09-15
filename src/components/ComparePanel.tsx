'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadPins, PIN_EVENT, savePins, type PinnedDeal } from '@/lib/pinned';
import { fmtUSD, fmtDate, bookingLink } from '@/lib/utils';
import { useToast } from './Toaster';

/**
 * Side-by-side comparison panel. Reads pinned deals from localStorage,
 * lays them out in 1-3 columns, highlights the winner per metric.
 *
 * Aligns:
 *   - Per-adult price (cheapest = green badge)
 *   - Party total
 *   - Trip length (shortest = green if dates available)
 *   - Stops (nonstop wins)
 *   - Origin / Destination / Dates
 *
 * Provides per-card unpin + a "clear all" action.
 */
export function ComparePanel() {
  const [pins, setPins] = useState<PinnedDeal[]>([]);
  const [mounted, setMounted] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setMounted(true);
    setPins(loadPins());
    const refresh = () => setPins(loadPins());
    window.addEventListener(PIN_EVENT, refresh);
    return () => window.removeEventListener(PIN_EVENT, refresh);
  }, []);

  if (!mounted) return null;
  if (pins.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-5xl mb-3">📌</div>
        <h2 className="!mb-1">No pins yet</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          On the dashboard, click the 📌 icon next to any deal to add it here. Compare up to three at a time.
        </p>
        <Link href="/" className="btn btn-primary mt-4">Browse deals →</Link>
      </div>
    );
  }

  // Winners across pinned deals.
  const minPerAdult = Math.min(...pins.map(p => p.per_adult_usd));
  const minParty = Math.min(...pins.map(p => p.party_total_usd));
  const minTrip = Math.min(...pins.map(p => Math.max(0, p.trip_length_days || 0)));
  const minStops = Math.min(...pins.map(p => Math.max(p.outbound_transfers ?? 0, p.return_transfers ?? 0)));

  function unpin(d: PinnedDeal) {
    const next = pins.filter(p => p.key !== d.key);
    savePins(next);
    setPins(next);
    toast.info('Unpinned', `${d.origin} → ${d.destination || 'CAI'} removed.`);
  }
  function clearAll() {
    savePins([]);
    setPins([]);
    toast.info('All pins cleared');
  }

  function winBadge(isWin: boolean) {
    return isWin ? <span className="badge badge-success ml-1">best</span> : null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-slate-500">{pins.length} of 3 pinned</div>
        <button onClick={clearAll} className="btn btn-sm">Clear all</button>
      </div>

      <div className={`grid gap-4 grid-cols-1 ${pins.length >= 2 ? 'md:grid-cols-2' : ''} ${pins.length >= 3 ? 'lg:grid-cols-3' : ''}`}>
        {pins.map(d => {
          const stops = Math.max(d.outbound_transfers ?? 0, d.return_transfers ?? 0);
          const isCheapest = d.per_adult_usd === minPerAdult;
          const isShortest = (d.trip_length_days || 0) === minTrip;
          const isStops = stops === minStops;
          const isParty = d.party_total_usd === minParty;
          const stopsLabel = stops === 0 ? 'Nonstop' : `${stops} stop${stops === 1 ? '' : 's'}`;
          return (
            <div key={d.key} className={`card relative ${isCheapest ? 'border-emerald-300 dark:border-emerald-700' : ''}`}>
              <button
                onClick={() => unpin(d)}
                aria-label="Unpin"
                className="absolute top-2 right-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-base leading-none"
              >×</button>
              <div className="eyebrow mb-1 text-brand-700 dark:text-brand-300">
                {d.origin} → {d.destination || 'CAI'}
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {fmtUSD(d.per_adult_usd)}<span className="text-sm text-slate-500 font-normal">/adult</span>
                {winBadge(isCheapest)}
              </div>

              <dl className="mt-4 space-y-2 text-sm">
                <Row label="Party total" value={<>{fmtUSD(d.party_total_usd)}{winBadge(isParty)}</>} />
                <Row label="Outbound"   value={fmtDate(d.outbound_date)} />
                <Row label="Return"     value={fmtDate(d.return_date)} />
                <Row label="Trip"       value={<>{d.trip_length_days} d{winBadge(isShortest)}</>} />
                <Row label="Stops"      value={<>{stopsLabel}{winBadge(isStops)}</>} />
                <Row label="Flights"    value={<span className="font-mono text-xs">{d.outbound_flight_no || '—'} / {d.return_flight_no || '—'}</span>} />
              </dl>

              <a
                href={bookingLink({
                  origin: d.origin, destination: d.destination || 'CAI',
                  departDate: d.outbound_date, returnDate: d.return_date,
                  adults: 4, infants: 1,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm mt-4 w-full justify-center"
              >
                Book → {fmtUSD(d.per_adult_usd)}/adult
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-800 dark:text-slate-200 font-medium">{value}</dd>
    </div>
  );
}

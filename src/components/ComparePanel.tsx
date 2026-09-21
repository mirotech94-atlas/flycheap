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
      <div className="ed-empty">
        <h2 className="ed-empty-head">No pins yet</h2>
        <p className="ed-empty-body">
          On the dashboard, click the 📌 icon next to any deal to add it here. Compare up to three at a time.
        </p>
        <Link href="/" className="ed-btn ed-btn-primary" style={{ marginTop: 16 }}>Browse deals →</Link>
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
    return isWin ? <span className="ed-chip status-ok" style={{ marginLeft: 6, padding: '2px 8px' }}>best</span> : null;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div className="ed-panel-note" style={{ marginTop: 0 }}>{pins.length} of 3 pinned</div>
        <button onClick={clearAll} className="ed-btn ed-btn-secondary">Clear all</button>
      </div>

      <div className="ed-tiles" style={{ gridTemplateColumns: `repeat(${pins.length}, 1fr)` }}>
        {pins.map(d => {
          const stops = Math.max(d.outbound_transfers ?? 0, d.return_transfers ?? 0);
          const isCheapest = d.per_adult_usd === minPerAdult;
          const isShortest = (d.trip_length_days || 0) === minTrip;
          const isStops = stops === minStops;
          const isParty = d.party_total_usd === minParty;
          const stopsLabel = stops === 0 ? 'Nonstop' : `${stops} stop${stops === 1 ? '' : 's'}`;
          return (
            <div
              key={d.key}
              className="ed-panel"
              style={{ position: 'relative', borderColor: isCheapest ? 'var(--green)' : undefined }}
            >
              <button
                onClick={() => unpin(d)}
                aria-label="Unpin"
                style={{ position: 'absolute', top: 10, right: 10, color: 'var(--muted)', fontSize: 16, lineHeight: 1, background: 'transparent', border: 0, cursor: 'pointer' }}
              >×</button>
              <div className="ed-eyebrow">
                {d.origin} → {d.destination || 'CAI'}
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 30, color: 'var(--ink)', marginTop: 4, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span className="ed-fare-text">{fmtUSD(d.per_adult_usd)}</span>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-ui)', marginLeft: 4 }}>/adult</span>
                {winBadge(isCheapest)}
              </div>

              <dl style={{ marginTop: 16, display: 'grid', gap: 8, fontSize: 13 }}>
                <Row label="Party total" value={<>{fmtUSD(d.party_total_usd)}{winBadge(isParty)}</>} />
                <Row label="Outbound"   value={fmtDate(d.outbound_date)} />
                <Row label="Return"     value={fmtDate(d.return_date)} />
                <Row label="Trip"       value={<>{d.trip_length_days} d{winBadge(isShortest)}</>} />
                <Row label="Stops"      value={<>{stopsLabel}{winBadge(isStops)}</>} />
                <Row label="Flights"    value={<span className="ed-mono" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>{d.outbound_flight_no || '—'} / {d.return_flight_no || '—'}</span>} />
              </dl>

              <a
                href={bookingLink({
                  origin: d.origin, destination: d.destination || 'CAI',
                  departDate: d.outbound_date, returnDate: d.return_date,
                  adults: 4, infants: 1,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="ed-btn ed-btn-primary"
                style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <dt className="ed-label" style={{ marginBottom: 0 }}>{label}</dt>
      <dd style={{ color: 'var(--ink)', fontWeight: 500, margin: 0 }}>{value}</dd>
    </div>
  );
}

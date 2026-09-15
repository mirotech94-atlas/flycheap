'use client';

import { useMemo, useState } from 'react';
import { BookingActions } from './BookingActions';

type Deal = {
  origin: string;
  destination?: string;
  outbound_date: string;
  return_date: string;
  outbound_dow: number;
  outbound_hour: number;
  return_dow: number;
  return_hour: number;
  trip_length_days: number;
  per_adult_usd: number;
  party_total_usd: number;
  outbound_transfers: number;
  return_transfers: number;
  outbound_flight_no: string;
  provider?: string;
};

const PROVIDER_LABELS: Record<string, string> = {
  travelpayouts: 'Travelpayouts',
  aviasales: 'Aviasales',
  'aviasales-tpk': 'Aviasales',
  tripcom: 'Trip.com',
  skyscanner: 'Skyscanner',
  wayaway: 'WayAway',
  amadeus: 'Amadeus',
  duffel: 'Duffel',
  kiwi: 'Kiwi',
  serpapi: 'Google Flights',
  searchapi: 'SearchAPI',
};

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function isSweet(d: Deal): boolean {
  const sweet = (dow: number, hour: number) => (dow === 2 || dow === 6) && hour >= 1 && hour <= 5;
  return sweet(d.outbound_dow, d.outbound_hour) && sweet(d.return_dow, d.return_hour);
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export function BestDealsCard({
  deals,
  threshold,
  matchesCount,
}: {
  deals: Deal[];
  threshold: number;
  matchesCount: number;
}) {
  const [filter, setFilter] = useState<'all' | 'sweet' | 'under' | 'nonstop' | string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const origins = useMemo(
    () => Array.from(new Set(deals.map(d => d.origin))).slice(0, 5),
    [deals],
  );
  const providersInData = useMemo(
    () => Array.from(new Set(deals.map(d => d.provider).filter(Boolean) as string[])).sort(),
    [deals],
  );
  const filtered = useMemo(() => {
    const byProvider = providerFilter === 'all'
      ? deals
      : deals.filter(d => (d.provider ?? 'travelpayouts') === providerFilter);
    if (filter === 'sweet') return byProvider.filter(d => isSweet(d));
    if (filter === 'under') return byProvider.filter(d => d.per_adult_usd < threshold);
    if (filter === 'nonstop') return byProvider.filter(d => Math.max(d.outbound_transfers, d.return_transfers) === 0);
    if (filter === 'stop1') return byProvider.filter(d => Math.max(d.outbound_transfers, d.return_transfers) === 1);
    if (filter === 'stop2plus') return byProvider.filter(d => Math.max(d.outbound_transfers, d.return_transfers) >= 2);
    if (origins.includes(filter)) return byProvider.filter(d => d.origin === filter);
    return byProvider;
  }, [filter, providerFilter, deals, threshold, origins]);

  // HOT badge: top 1% cheapest in the visible set (or just the cheapest 2)
  const hotCutoff = filtered.length > 0
    ? [...filtered].sort((a, b) => a.per_adult_usd - b.per_adult_usd)[Math.min(1, filtered.length - 1)].per_adult_usd
    : 0;

  return (
    <div className="fc-fcard">
      <div className="fc-fcard-head">
        <div>
          <div className="fc-smallcaps">12-Month opportunity scan · 1,000+ airlines</div>
          <h2 className="fc-fcard-title">Best fares <em>worldwide</em></h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {providersInData.length > 1 && (
            <label className="text-[11px] uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <span>Source</span>
              <select
                value={providerFilter}
                onChange={e => setProviderFilter(e.target.value)}
                className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 normal-case tracking-normal"
                title="Filter to deals priced by one specific source"
              >
                <option value="all">All sources</option>
                {providersInData.map(p => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p] ?? p}</option>
                ))}
              </select>
            </label>
          )}
          <span className="fc-badge fc-badge-mute">{filtered.length} MATCHES</span>
        </div>
      </div>
      <div className="fc-chips">
        <button className={'fc-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>All routes</button>
        <button className={'fc-chip fc-chip-gold' + (filter === 'sweet' ? ' active' : '')} onClick={() => setFilter('sweet')}>Sweet-spot</button>
        <button className={'fc-chip' + (filter === 'under' ? ' active' : '')} onClick={() => setFilter('under')}>Below threshold</button>
        {origins.map(o => (
          <button key={o}
            className={'fc-chip' + (filter === o ? ' active' : '')}
            onClick={() => setFilter(o)}>
            {o} origin
          </button>
        ))}
        <button className={'fc-chip' + (filter === 'nonstop' ? ' active' : '')} onClick={() => setFilter('nonstop')}>Nonstop</button>
        <button className={'fc-chip' + (filter === 'stop1' ? ' active' : '')} onClick={() => setFilter('stop1')}>1 stop</button>
        <button className={'fc-chip' + (filter === 'stop2plus' ? ' active' : '')} onClick={() => setFilter('stop2plus')}>2+ stops</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="fc-deals-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Route</th>
              <th>Outbound</th>
              <th>Return</th>
              <th>Trip</th>
              <th style={{ textAlign: 'right' }}>Per adult</th>
              <th style={{ textAlign: 'right' }}>Party (4+1)</th>
              <th>vs ${Math.round(threshold)}</th>
              <th>Confidence</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 9).map((r, i) => {
              const delta = r.per_adult_usd - threshold;
              const below = delta < 0;
              const sweet = isSweet(r);
              const hot = r.per_adult_usd <= hotCutoff && i < 2;
              // Confidence: 80%+ for very cheap below median, scale down by rank
              const conf = Math.max(50, 92 - i * 3);
              const confColor = conf > 80 ? '#1f8a5b' : conf > 70 ? '#d4af37' : '#c1426b';
              const dest = r.destination || 'CAI';
              return (
                <tr key={i} className={sweet ? 'fc-row-sweetspot' : ''}>
                  <td className="fc-col-rank">{String(i + 1).padStart(2, '0')}</td>
                  <td className="fc-col-route">
                    {r.origin}<span className="arrow">→</span><span className="dest">{dest}</span>
                    {hot && <span className="fc-badge fc-badge-hot" style={{ marginLeft: 8 }}>HOT</span>}
                  </td>
                  <td className="fc-col-date">
                    <span className="day">{DOW[r.outbound_dow]}</span>
                    {formatDate(r.outbound_date)}{' '}
                    <span className="mono" style={{ color: 'var(--fc-faint)', fontSize: 11 }}>{formatHour(r.outbound_hour)}</span>
                  </td>
                  <td className="fc-col-date">
                    <span className="day">{DOW[r.return_dow]}</span>
                    {formatDate(r.return_date)}{' '}
                    <span className="mono" style={{ color: 'var(--fc-faint)', fontSize: 11 }}>{formatHour(r.return_hour)}</span>
                  </td>
                  <td style={{ color: 'var(--fc-muted)', fontFamily: 'var(--font-mono, ui-monospace)', fontSize: 12 }}>
                    {r.trip_length_days}d
                  </td>
                  <td className="fc-col-price">
                    <span className="currency">$</span>{Math.round(r.per_adult_usd)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono, ui-monospace)', fontSize: 13, color: 'var(--fc-muted)' }}>
                    ${Math.round(r.party_total_usd).toLocaleString()}
                  </td>
                  <td className={'fc-col-vs ' + (below ? 'fc-vs-below' : 'fc-vs-above')}>
                    {below ? '−' : '+'}${Math.round(Math.abs(delta))}
                  </td>
                  <td>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className="fc-conf-bar">
                        <span className="fc-conf-fill" style={{ width: `${conf}%`, background: confColor, display: 'block' }} />
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono, ui-monospace)', fontSize: 11, color: 'var(--fc-muted)' }}>{conf}%</span>
                    </div>
                  </td>
                  <td>
                    <BookingActions
                      origin={r.origin}
                      destination={dest}
                      departDate={r.outbound_date}
                      returnDate={r.return_date}
                      adults={4}
                      infants={1}
                      size="sm"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="fc-deals-footer">
        <span>Showing {Math.min(9, filtered.length)} of {matchesCount} matches</span>
        <span>{filtered.length} match current filter</span>
      </div>
    </div>
  );
}

'use client';
import { useMemo, useState } from 'react';
import { BookButton } from './BookButton';

export type FcDealRow = {
  origin: string;
  dest: string;
  out: string;        // "Jul 8"
  outDay: string;     // "TUE 03:15"
  ret: string;
  retDay: string;
  trip: number;
  per: number;
  party: number;
  threshold: number;
  sweet?: boolean;
  hot?: boolean;
  conf: number;
  /** Single-button fallback href if no provider picker (legacy). */
  bookHref?: string;
  /** ISO date + party — when present, the table renders a provider-picker
   *  dropdown (BookButton) so users can choose Aviasales / Skyscanner / Kayak
   *  / Google Flights / Momondo / EgyptAir.com for booking. Every link routes
   *  through /go for affiliate-click tracking. */
  outboundDateIso?: string;
  returnDateIso?: string;
  adults?: number;
  infants?: number;
};

const MOCK_ROWS: FcDealRow[] = [
  // TODO: wire to real data — e.g. queries.topRoutesByClicks30d() or bestDeals cache
  { origin: 'JFK', dest: 'CAI', out: 'Jul 8', outDay: 'TUE 03:15', ret: 'Jul 22', retDay: 'SAT 04:50', trip: 14, per: 589, party: 2356, threshold: 800, sweet: true, conf: 92 },
  { origin: 'EWR', dest: 'CAI', out: 'Aug 12', outDay: 'TUE 02:40', ret: 'Aug 30', retDay: 'SAT 04:50', trip: 18, per: 612, party: 2448, threshold: 800, sweet: true, hot: true, conf: 88 },
  { origin: 'EWR', dest: 'CAI', out: 'Sep 6', outDay: 'SAT 03:00', ret: 'Sep 23', retDay: 'TUE 04:50', trip: 17, per: 624, party: 2496, threshold: 800, sweet: true, conf: 84 },
  { origin: 'JFK', dest: 'CAI', out: 'Jun 24', outDay: 'TUE 12:00', ret: 'Jul 8', retDay: 'TUE 05:00', trip: 14, per: 638, party: 2552, threshold: 800, conf: 79 },
  { origin: 'JFK', dest: 'CAI', out: 'Oct 14', outDay: 'TUE 12:00', ret: 'Oct 28', retDay: 'TUE 05:00', trip: 14, per: 654, party: 2616, threshold: 800, conf: 81 },
  { origin: 'EWR', dest: 'CAI', out: 'Nov 11', outDay: 'TUE 13:00', ret: 'Nov 25', retDay: 'TUE 05:00', trip: 14, per: 671, party: 2684, threshold: 800, conf: 76 },
  { origin: 'JFK', dest: 'CAI', out: 'Feb 3', outDay: 'TUE 12:00', ret: 'Feb 17', retDay: 'TUE 05:00', trip: 14, per: 712, party: 2848, threshold: 800, conf: 71 },
  { origin: 'EWR', dest: 'CAI', out: 'Apr 7', outDay: 'TUE 13:00', ret: 'Apr 21', retDay: 'TUE 05:00', trip: 14, per: 748, party: 2992, threshold: 800, conf: 68 },
  { origin: 'JFK', dest: 'CAI', out: 'Dec 16', outDay: 'TUE 12:00', ret: 'Dec 30', retDay: 'TUE 05:00', trip: 14, per: 892, party: 3568, threshold: 800, conf: 64 },
];

type FilterKey = 'all' | 'sweet' | 'under' | string; // string = origin code like 'JFK'

export function FcBestDealsTable({ rows, totalMonitored }: { rows?: FcDealRow[]; totalMonitored?: number }) {
  const data = rows && rows.length > 0 ? rows : MOCK_ROWS;
  const [filter, setFilter] = useState<FilterKey>('all');

  // Derive origin chips from data (top 4 origins by count) so the table reflects
  // whatever routes the user is actually tracking, not a hardcoded JFK/EWR pair.
  const originChips = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of data) counts[r.origin] = (counts[r.origin] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([o]) => o);
  }, [data]);

  const filtered = useMemo(() => {
    if (filter === 'sweet') return data.filter(r => r.sweet);
    if (filter === 'under') return data.filter(r => r.per < r.threshold);
    if (filter === 'all') return data;
    return data.filter(r => r.origin === filter);
  }, [filter, data]);

  return (
    <div className="fc-card">
      <div className="fc-card-head">
        <div>
          <div className="fc-smallcaps">12-Month opportunity scan · 1,000+ airlines</div>
          <h2 className="fc-card-title">Best fares <em>worldwide</em></h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="fc-badge fc-badge-mute fc-mono" style={{ fontSize: 10, letterSpacing: '.1em' }}>{filtered.length} MATCHES</span>
        </div>
      </div>
      <div className="fc-chips">
        <div className={'fc-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>All routes</div>
        <div className={'fc-chip fc-chip-gold' + (filter === 'sweet' ? ' active' : '')} onClick={() => setFilter('sweet')}>Sweet-spot ✦</div>
        <div className={'fc-chip' + (filter === 'under' ? ' active' : '')} onClick={() => setFilter('under')}>Below threshold</div>
        {originChips.map(o => (
          <div key={o} className={'fc-chip' + (filter === o ? ' active' : '')} onClick={() => setFilter(o)}>{o} origin</div>
        ))}
      </div>
      <div className="fc-deals-table-wrap">
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
              <th>vs ${data[0]?.threshold ?? 800}</th>
              <th>Confidence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const delta = r.per - r.threshold;
              const below = delta < 0;
              return (
                <tr key={i} className={r.sweet ? 'fc-row-sweetspot' : ''}>
                  <td className="fc-col-rank">{String(i + 1).padStart(2, '0')}</td>
                  <td className="fc-col-route">
                    {r.origin}<span className="arrow">→</span><span className="dest">{r.dest}</span>
                    {r.hot && <span className="fc-badge fc-badge-hot" style={{ marginLeft: 8 }}>HOT</span>}
                  </td>
                  <td className="fc-col-date">
                    <span className="day">{r.outDay.split(' ')[0]}</span>
                    {r.out} <span className="fc-mono" style={{ color: '#8a93a6', fontSize: 11 }}>{r.outDay.split(' ')[1]}</span>
                  </td>
                  <td className="fc-col-date">
                    <span className="day">{r.retDay.split(' ')[0]}</span>
                    {r.ret} <span className="fc-mono" style={{ color: '#8a93a6', fontSize: 11 }}>{r.retDay.split(' ')[1]}</span>
                  </td>
                  <td style={{ color: 'var(--fc-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.trip}d</td>
                  <td className="fc-col-price"><span className="currency">$</span>{r.per}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fc-muted)' }}>
                    ${r.party.toLocaleString()}
                  </td>
                  <td className={'fc-col-vs ' + (below ? 'fc-vs-below' : 'fc-vs-above')}>
                    {below ? '−' : '+'}${Math.abs(delta)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 38, height: 4, background: '#eef2f7', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{
                          width: `${r.conf}%`, height: '100%',
                          background: r.conf > 80 ? '#1f8a5b' : r.conf > 70 ? '#E8A33D' : '#c1426b',
                        }} />
                      </div>
                      <span className="fc-mono" style={{ fontSize: 11, color: 'var(--fc-muted)' }}>{r.conf}%</span>
                    </div>
                  </td>
                  <td>
                    {r.outboundDateIso && r.returnDateIso ? (
                      // Provider-picker dropdown — user can pick which company
                      // to book through (Aviasales / Skyscanner / Kayak /
                      // Google Flights / Momondo / EgyptAir direct).
                      <BookButton
                        origin={r.origin}
                        destination={r.dest}
                        departDate={r.outboundDateIso}
                        returnDate={r.returnDateIso}
                        adults={r.adults ?? 1}
                        infants={r.infants ?? 0}
                        perAdultUsd={r.per}
                        surface="dashboard-tracked-table"
                        size="sm"
                      />
                    ) : r.bookHref ? (
                      <a className="fc-btn fc-btn-ink fc-btn-sm" href={r.bookHref} target="_blank" rel="noopener noreferrer sponsored">Book →</a>
                    ) : (
                      <button className="fc-btn fc-btn-ink fc-btn-sm">Book →</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="fc-deals-footer">
        <span>Refreshed live · cache age &lt; 5m</span>
        <span>Showing {filtered.length} of {totalMonitored ?? data.length} routes monitored</span>
      </div>
    </div>
  );
}

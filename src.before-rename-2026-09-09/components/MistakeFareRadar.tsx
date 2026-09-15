import { fmtDate, fmtUSD } from '@/lib/utils';
import { BookingActions } from './BookingActions';

type Deal = {
  origin: string;
  destination?: string;
  outbound_date: string;
  return_date: string;
  per_adult_usd: number;
  outbound_flight_no: string;
  return_flight_no: string;
  outbound_transfers?: number;
  return_transfers?: number;
};

// Find anomalies: per-adult fare significantly below the median for that route.
// A "mistake fare" here is defined as ≥30% below the route's median, where a
// "route" is the (origin, destination) pair — so we don't compare JFK→CAI
// medians against LAX→NRT prices.
function detectAnomalies(deals: Deal[]): Array<Deal & { median: number; pct: number }> {
  if (deals.length === 0) return [];
  const byRoute = new Map<string, Deal[]>();
  for (const d of deals) {
    const key = `${d.origin}|${d.destination ?? ''}`;
    if (!byRoute.has(key)) byRoute.set(key, []);
    byRoute.get(key)!.push(d);
  }
  const out: Array<Deal & { median: number; pct: number }> = [];
  for (const [, group] of byRoute) {
    const prices = group.map(g => g.per_adult_usd).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    if (!median) continue;
    for (const d of group) {
      const pct = Math.round(((median - d.per_adult_usd) / median) * 100);
      if (pct >= 30) out.push({ ...d, median, pct });
    }
  }
  return out.sort((a, b) => b.pct - a.pct).slice(0, 4);
}

export function MistakeFareRadar({
  deals,
  destinationIata,
}: {
  deals: Deal[];
  destinationIata: string;
}) {
  const anomalies = detectAnomalies(deals);
  const count = anomalies.length;

  return (
    <div className="fc-radar">
      <div className="fc-radar-left">
        <div className="fc-eyebrow">Mistake-Fare Radar · Live</div>
        <h2 className="fc-radar-h">
          When airlines <em>misprice</em>, we wake you up.
        </h2>
        <p className="fc-radar-lede">
          Our anomaly engine flags fares ≥30% below the rolling median across every origin we monitor. These are real, currently-bookable mispricings — often pulled within hours.
        </p>
        {count === 0 ? (
          <p className="fc-radar-lede" style={{ marginTop: 22 }}>
            No active mistake fares right now — the market is pricing your routes within normal bands. We&rsquo;ll surface them here the moment a fare deviates.
          </p>
        ) : (
          <div className="fc-fare-list">
            {anomalies.map((f, i) => (
              <div key={i} className="fc-fare" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', alignItems: 'center', gap: 12 }}>
                <div className="fc-fare-time">{(f.outbound_flight_no || '').padStart(5, ' ')}</div>
                <div className="fc-fare-route">
                  {f.origin} → {f.destination || destinationIata}
                  <span className="sm">
                    {fmtDate(f.outbound_date)} – {fmtDate(f.return_date)}
                    {typeof f.outbound_transfers === 'number' && f.outbound_transfers === 0 ? ' · nonstop' : ''}
                  </span>
                </div>
                <div className="fc-fare-was">{fmtUSD(f.median)}</div>
                <div className="fc-fare-now">
                  {fmtUSD(f.per_adult_usd)}
                  <span className="pct">−{f.pct}%</span>
                </div>
                <BookingActions
                  origin={f.origin}
                  destination={f.destination || destinationIata}
                  departDate={f.outbound_date}
                  returnDate={f.return_date}
                  adults={4}
                  infants={1}
                  size="sm"
                />
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="fc-radar-right">
        <div className="fc-radar-ring">
          <div className="fc-radar-sweep" />
          {anomalies.slice(0, 4).map((_, i) => {
            const positions = [
              { top: '22%', left: '32%' },
              { top: '58%', left: '70%' },
              { top: '74%', left: '38%' },
              { top: '34%', left: '64%', opacity: 0.55 },
            ];
            return <div key={i} className="fc-radar-blip" style={positions[i]} />;
          })}
          <div className="fc-radar-center">
            {String(count).padStart(2, '0')}
            <span className="lbl">Live anomalies</span>
          </div>
        </div>
      </div>
    </div>
  );
}

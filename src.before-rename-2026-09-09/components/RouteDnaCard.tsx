import { fmtUSD } from '@/lib/utils';

type Deal = {
  origin: string;
  per_adult_usd: number;
  outbound_dow: number;
  outbound_hour: number;
  return_dow: number;
  return_hour: number;
  trip_length_days: number;
  outbound_date: string;
};

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function mode<T extends string | number>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T = values[0];
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return best;
}

export function RouteDnaCard({
  deals,
  originIata,
  destinationIata,
  originLabel,
  destLabel,
}: {
  deals: Deal[];
  originIata: string;
  destinationIata: string;
  originLabel: string;
  destLabel: string;
}) {
  const routeDeals = deals.filter(d => d.origin === originIata);
  if (routeDeals.length === 0) {
    return (
      <div className="fc-card">
        <div className="fc-card-head">
          <div>
            <div className="fc-smallcaps">Pattern intelligence</div>
            <h2 className="fc-card-title">Route <em>DNA</em></h2>
            <div className="fc-card-meta">{originIata} ↔ {destinationIata} · no data yet</div>
          </div>
        </div>
        <div style={{ padding: 24, fontSize: 13, color: 'var(--fc-muted)' }}>
          Once we&rsquo;ve scanned a few months of fares we&rsquo;ll surface the cheapest day, hour, and trip length here.
        </div>
      </div>
    );
  }

  const cheapestQuartile = [...routeDeals]
    .sort((a, b) => a.per_adult_usd - b.per_adult_usd)
    .slice(0, Math.max(1, Math.ceil(routeDeals.length / 4)));

  const cheapDow = mode(cheapestQuartile.map(d => d.outbound_dow)) ?? 2;
  const cheapHour = mode(cheapestQuartile.map(d => Math.floor(d.outbound_hour / 3) * 3)) ?? 3;
  const bestTrip = mode(cheapestQuartile.map(d => d.trip_length_days)) ?? 14;
  const prices = routeDeals.map(d => d.per_adult_usd).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const floor = prices[0];
  const max = prices[prices.length - 1] || 1;

  // Book-by window: median days between today and the outbound dates of the
  // cheapest quartile.
  const today = new Date();
  const daysOut = cheapestQuartile.map(d => {
    const dep = new Date(d.outbound_date + 'T00:00:00Z');
    return Math.round((dep.getTime() - today.getTime()) / 86_400_000);
  }).sort((a, b) => a - b);
  const bookBy = daysOut[Math.floor(daysOut.length / 2)] ?? 47;

  const recCheapest = cheapestQuartile[0];
  const savings = median - (recCheapest?.per_adult_usd ?? median);

  return (
    <div className="fc-card">
      <div className="fc-card-head">
        <div>
          <div className="fc-smallcaps">Pattern intelligence</div>
          <h2 className="fc-card-title">Route <em>DNA</em></h2>
          <div className="fc-card-meta">{originIata} ↔ {destinationIata} · {routeDeals.length} fares observed · based on your tracked-route history</div>
        </div>
      </div>

      <div className="fc-dna-flightcard">
        <div className="fc-dna-route">
          <div className="fc-dna-iata">
            {originIata}
            <span className="lbl">{originLabel}</span>
          </div>
          <div className="fc-dna-plane">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22 12L12 17V14L4 12L12 10V7L22 12Z" fill="currentColor" />
            </svg>
          </div>
          <div className="fc-dna-iata r">
            {destinationIata}
            <span className="lbl">{destLabel}</span>
          </div>
        </div>
      </div>

      <div className="fc-dna-vis">
        <div className="fc-dna-row">
          <div className="fc-dna-label">Cheap day</div>
          <div className="fc-dna-bar"><div className="fc-dna-fill" style={{ width: '85%' }} /></div>
          <div className="fc-dna-val">{DOW_NAMES[cheapDow]}</div>
        </div>
        <div className="fc-dna-row">
          <div className="fc-dna-label">Cheap hour</div>
          <div className="fc-dna-bar"><div className="fc-dna-fill" style={{ width: '72%' }} /></div>
          <div className="fc-dna-val">{String(cheapHour).padStart(2, '0')}:00</div>
        </div>
        <div className="fc-dna-row">
          <div className="fc-dna-label">Best trip</div>
          <div className="fc-dna-bar"><div className="fc-dna-fill" style={{ width: '64%' }} /></div>
          <div className="fc-dna-val">{bestTrip}d</div>
        </div>
        <div className="fc-dna-row">
          <div className="fc-dna-label">Median</div>
          <div className="fc-dna-bar">
            <div className="fc-dna-fill" style={{ width: `${Math.round((median / max) * 100)}%` }} />
          </div>
          <div className="fc-dna-val">{fmtUSD(median)}</div>
        </div>
        <div className="fc-dna-row">
          <div className="fc-dna-label">Floor</div>
          <div className="fc-dna-bar">
            <div className="fc-dna-fill" style={{ width: `${Math.round((floor / max) * 100)}%` }} />
          </div>
          <div className="fc-dna-val">{fmtUSD(floor)}</div>
        </div>
        <div className="fc-dna-row">
          <div className="fc-dna-label">Book by</div>
          <div className="fc-dna-bar"><div className="fc-dna-fill" style={{ width: '46%' }} /></div>
          <div className="fc-dna-val">{bookBy > 0 ? `−${bookBy}d` : 'now'}</div>
        </div>
      </div>

      {recCheapest && savings > 0 && (
        <div className="fc-rec">
          <strong>Recommendation:</strong> Book a {DOW_NAMES[cheapDow]} {String(cheapHour).padStart(2, '0')}:00 departure for a {bestTrip}-day trip {bookBy > 0 ? `within the next ${bookBy} days` : 'now'}. You&rsquo;re <strong>{fmtUSD(savings)} below median</strong> on the current best deal.
        </div>
      )}
    </div>
  );
}

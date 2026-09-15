import { fmtUSD } from '@/lib/utils';
import { SvgGlobe, type GlobeArc } from './SvgGlobe';

type Deal = {
  origin: string;
  destination?: string;
  per_adult_usd: number;
  party_total_usd: number;
};

export function ExecutiveHero({
  deals,
  threshold,
  trackedCount,
  weekLabel,
  destinationIata,
}: {
  deals: Deal[];
  threshold: number;
  trackedCount: number;
  weekLabel: string;
  destinationIata: string;
}) {
  const cheapest = deals[0];
  const sub700 = deals.filter(d => d.per_adult_usd < 700).length;
  // Distinct destinations currently in the scan — a credible "breadth" stat
  // for the hero, instead of "N below threshold / N" which reads as 2300/2300
  // whenever the display threshold is high enough to include everything.
  const destinationsLive = new Set(deals.map(d => d.destination || destinationIata)).size;
  const median = deals.length
    ? (() => {
        const sorted = [...deals].map(d => d.per_adult_usd).sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      })()
    : 0;
  const deltaToMedian = cheapest && median ? cheapest.per_adult_usd - median : 0;

  // Build globe arcs from real deal origin→destination pairs across the cache.
  // De-dup on the (from, to) pair so each distinct route shows once; mark the
  // cheapest pair as the "hot" arc. This makes the globe read as a worldwide
  // network rather than a single hub.
  const pairSet = new Set<string>();
  const arcSpec: { from: string; to: string }[] = [];
  for (const d of deals.slice(0, 60)) {
    const to = d.destination || destinationIata;
    const k = `${d.origin}|${to}`;
    if (pairSet.has(k) || d.origin === to) continue;
    pairSet.add(k);
    arcSpec.push({ from: d.origin, to });
    if (arcSpec.length >= 14) break;
  }
  const cheapestKey = cheapest ? `${cheapest.origin}|${cheapest.destination || destinationIata}` : '';
  const arcs: GlobeArc[] = arcSpec.map(({ from, to }) => ({
    from, to,
    hot: `${from}|${to}` === cheapestKey,
  }));
  if (arcs.length < 3) {
    const fillers: GlobeArc[] = [
      { from: 'JFK', to: 'LHR' },
      { from: 'LAX', to: 'NRT' },
      { from: 'FRA', to: 'BKK' },
      { from: 'IST', to: destinationIata },
    ].filter(a => !pairSet.has(`${a.from}|${a.to}`));
    arcs.push(...fillers.slice(0, 3 - arcs.length));
  }
  // Set of hub airports for visual emphasis on the globe = every code that
  // appears as either an origin or destination in the rendered arcs.
  const hubCodes = Array.from(new Set(arcs.flatMap(a => [a.from, a.to])));

  return (
    <section className="fc-hero">
      <div className="fc-hero-grid">
        <div>
          <div className="fc-eyebrow">Executive Brief · {weekLabel}</div>
          <h1 className="fc-h1">
            {sub700 > 0 ? (
              <>
                We&rsquo;ve found <em>{sub700}</em> sub-$700 round-trip{sub700 === 1 ? '' : 's'}&nbsp;
                <span className="strike">your travel agent</span>&nbsp;<em>missed</em>.
              </>
            ) : (
              <>
                Cheapest fare we&rsquo;re seeing&nbsp;
                <span className="strike">on Google</span>&nbsp;
                <em>{cheapest ? fmtUSD(cheapest.per_adult_usd) : '—'}</em>.
              </>
            )}
          </h1>
          <p className="fc-lede">
            While the rest of the internet refreshes Google Flights at 2 AM, our engine quietly polls 1,000+ airlines, hunts pricing glitches, and pings you the second a fare on <em>your</em> route falls off a cliff. You sleep. We work. You book.
          </p>
          <div className="fc-hero-cta">
            {cheapest && (
              <a className="fc-btn fc-btn-gold" href="/offers">
                Book cheapest → {fmtUSD(cheapest.per_adult_usd)}
              </a>
            )}
            <a className="fc-btn fc-btn-ghost" href="/searches">Add a new watch</a>
          </div>
          <div className="fc-hero-stats">
            <div>
              <div className="fc-hero-stat-label">Cheapest right now</div>
              <div className="fc-hero-stat-value">
                {cheapest ? fmtUSD(cheapest.per_adult_usd) : '—'}
                {cheapest && deltaToMedian < 0 && (
                  <span className="fc-delta fc-delta-down">▼ {fmtUSD(Math.abs(deltaToMedian))}</span>
                )}
                {cheapest && deltaToMedian > 0 && (
                  <span className="fc-delta fc-delta-up">▲ {fmtUSD(deltaToMedian)}</span>
                )}
              </div>
            </div>
            <div>
              <div className="fc-hero-stat-label">Median (scanned)</div>
              <div className="fc-hero-stat-value">
                {median ? fmtUSD(median) : '—'}
                <span className="fc-delta fc-delta-flat">±{fmtUSD(Math.round(median * 0.04))}</span>
              </div>
            </div>
            <div>
              <div className="fc-hero-stat-label">Destinations live</div>
              <div className="fc-hero-stat-value">
                {destinationsLive}
                <span className="fc-delta fc-delta-flat">cities</span>
              </div>
            </div>
          </div>
        </div>
        <div className="fc-hero-globe">
          <div className="fc-globe-frame">
            <span className="c tl" /><span className="c tr" />
            <span className="c bl" /><span className="c br" />
          </div>
          <div className="fc-globe-tag tl">
            LIVE NETWORK · {trackedCount} ROUTES
          </div>
          <div className="fc-globe-tag br">
            {arcs.length} ARC{arcs.length === 1 ? '' : 'S'} · WORLDWIDE
          </div>
          <SvgGlobe arcs={arcs} hubCodes={hubCodes} />
        </div>
      </div>
    </section>
  );
}

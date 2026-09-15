import { partyCo2Kg } from '@/lib/carbon';

export function CarbonLedger({
  origin,
  destination,
  adults,
  infants,
}: {
  origin: string;
  destination: string;
  adults: number;
  infants: number;
}) {
  const party = adults + Math.max(0, infants);
  const kg = partyCo2Kg(origin, destination, party);
  // Rough equivalents (kg CO2e). USA per-capita ~ 16t/yr; powering a US
  // household ~ 5.5t/yr; driving a US car ~ 220 g/km.
  const avgAnnual = 16000;
  const householdMonth = 5500 / 12;
  const carKm = kg / 0.22;

  const offsetUsd = Math.max(0, Math.round(kg * 0.012));

  return (
    <div className="fc-card">
      <div className="fc-card-head">
        <div>
          <div className="fc-smallcaps">Footprint ledger · Tracked party</div>
          <h2 className="fc-card-title">Carbon <em>budget</em></h2>
          <div className="fc-card-meta">Round-trip · {adults} adult{adults === 1 ? '' : 's'}{infants > 0 ? ` + ${infants} infant${infants === 1 ? '' : 's'}` : ''}</div>
        </div>
        <details className="text-[11px] text-slate-500 dark:text-slate-400" style={{ maxWidth: 220 }}>
          <summary className="cursor-pointer underline decoration-dotted">What is this?</summary>
          <div className="mt-1 leading-relaxed">
            We estimate your trip&rsquo;s CO₂ using great-circle distance × an industry blend of seat-km factors (75–90 g/km) + 9% radiative forcing for high-altitude effects, multiplied by your party size. <strong>Improve it by:</strong> flying nonstop (less takeoff fuel), economy (more seats per ton of fuel), and offsetting through the link below.
          </div>
        </details>
      </div>
      <div className="fc-carbon">
        <div className="fc-smallcaps">Estimated CO₂ for cheapest pairing</div>
        <div className="fc-carbon-hero">
          {kg ? kg.toLocaleString() : '—'}
          <span className="unit">kg CO₂e</span>
        </div>
        <div className="fc-smallcaps">Roughly equivalent to</div>
        <div style={{ marginTop: 12 }}>
          <div className="fc-carbon-row">
            <div className="fc-carbon-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12 H21 M12 3 Q16 8 12 12 Q8 16 12 21" />
              </svg>
            </div>
            <div>{(kg / avgAnnual).toFixed(2)}× annual emissions of one average resident</div>
            <div className="val">×{(kg / avgAnnual).toFixed(2)}</div>
          </div>
          <div className="fc-carbon-row">
            <div className="fc-carbon-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="9" rx="2" />
                <path d="M7 11V8a5 5 0 0110 0v3" />
              </svg>
            </div>
            <div>Powering a household for {Math.max(1, Math.round(kg / householdMonth))} months</div>
            <div className="val">{Math.max(1, Math.round(kg / householdMonth))}mo</div>
          </div>
          <div className="fc-carbon-row">
            <div className="fc-carbon-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-7.5 8-13a8 8 0 10-16 0c0 5.5 8 13 8 13z" />
              </svg>
            </div>
            <div>Driving {Math.round(carKm).toLocaleString()} km in an average car</div>
            <div className="val">{Math.round(carKm).toLocaleString()} km</div>
          </div>
        </div>
        {offsetUsd > 0 && (
          <div className="fc-carbon-cta">
            <strong>Offset ≈ ${offsetUsd}</strong> via verified Gold Standard projects when you book — added at checkout, fully neutral on this trip.{' '}
            <a
              href="https://www.goldstandard.org/take-action/offset-your-emissions"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Offset now →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

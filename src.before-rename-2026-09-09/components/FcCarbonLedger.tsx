// Server component — carbon ledger card, bound to lib/carbon.
export type CarbonInputs = {
  kg: number;
  origin: string;
  destination: string;
  adults: number;
  infants?: number;
};

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

export function FcCarbonLedger({ data }: { data?: CarbonInputs }) {
  const d: CarbonInputs = data ?? { kg: 7420, origin: 'JFK', destination: 'CAI', adults: 4, infants: 1 };
  const kg = Math.max(0, Math.round(d.kg));
  // Friendly equivalents (approximations).
  const treeYears = kg / 21;            // ~21 kg CO2/tree/yr
  const milesDriven = kg / 0.404;       // 0.404 kg CO2 / mile (avg car)
  const householdMonths = kg / 530;     // ~530 kg/mo avg US household
  // Offset price: $15 per tonne (Gold Standard ballpark).
  const offsetUsd = Math.max(1, Math.round((kg / 1000) * 15));

  const partyLabel = d.infants && d.infants > 0
    ? `Round-trip · ${d.adults} adults + ${d.infants} infant`
    : `Round-trip · ${d.adults} adult${d.adults === 1 ? '' : 's'}`;

  return (
    <div className="fc-card">
      <div className="fc-card-head">
        <div>
          <div className="fc-smallcaps">Footprint ledger · Tracked party</div>
          <h2 className="fc-card-title">Carbon <em>budget</em></h2>
          <div className="fc-card-meta">{partyLabel} · {d.origin}↔{d.destination}</div>
        </div>
        <span className="fc-badge fc-badge-ok">est.</span>
      </div>
      <div className="fc-carbon">
        <div className="fc-smallcaps">Estimated CO₂ for cheapest pairing</div>
        <div className="fc-carbon-hero">
          {fmtNum(kg)} <span className="fc-unit">kg CO₂e</span>
        </div>
        <div className="fc-smallcaps">Roughly equivalent to</div>
        <div className="fc-carbon-eq">
          <div className="fc-carbon-row">
            <div className="fc-carbon-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M6 8c0-3 3-5 6-5s6 2 6 5c0 3-3 5-6 5s-6-2-6-5z" />
              </svg>
            </div>
            <div>{fmtNum(treeYears)} mature-tree years to absorb</div>
            <div className="val">{fmtNum(treeYears)}t·yr</div>
          </div>
          <div className="fc-carbon-row">
            <div className="fc-carbon-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="9" rx="2" />
                <path d="M7 11V8a5 5 0 0110 0v3" />
              </svg>
            </div>
            <div>Powering an average household for {fmtNum(householdMonths)} months</div>
            <div className="val">{fmtNum(householdMonths)}mo</div>
          </div>
          <div className="fc-carbon-row">
            <div className="fc-carbon-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6.5" cy="17" r="2" /><circle cx="17.5" cy="17" r="2" />
                <path d="M3 17h2M16 17h-7M21 17h-1.5" />
              </svg>
            </div>
            <div>Driving {fmtNum(milesDriven)} miles in an average car</div>
            <div className="val">{fmtNum(milesDriven)}mi</div>
          </div>
        </div>
        <a className="fc-carbon-cta" href="/about#carbon" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <strong>Offset ${offsetUsd}</strong> via verified Gold Standard projects when you book — neutralizes this trip&apos;s footprint.
        </a>
      </div>
    </div>
  );
}

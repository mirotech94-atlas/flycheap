'use client';

import { SvgGlobe, type GlobeArc } from './SvgGlobe';

// Compact decorative globe for the Hotels page. Highlights the selected
// destination as the "hot" hub and draws four representative arcs from
// common origin hubs so the globe never feels empty.

const ORIGIN_HUBS = ['JFK', 'LHR', 'DXB', 'SIN'];

export function HotelsMiniGlobe({ destination }: { destination: string }) {
  const dest = destination.toUpperCase();
  const arcs: GlobeArc[] = ORIGIN_HUBS
    .filter(o => o !== dest)
    .slice(0, 4)
    .map((o, i) => ({ from: o, to: dest, hot: i === 0 }));
  const hubCodes = Array.from(new Set([dest, ...ORIGIN_HUBS]));

  return (
    <div className="ed-panel relative overflow-hidden" style={{ minHeight: 280 }}>
      <div className="ed-panel-head">
        <div>
          <div className="ed-eyebrow">Where</div>
          <h2 className="ed-panel-title">{dest}</h2>
        </div>
        <div className="ed-mono" style={{ color: 'var(--muted-2)' }}>Routes in</div>
      </div>
      <div className="relative" style={{ height: 220 }}>
        <SvgGlobe arcs={arcs} hubCodes={hubCodes} />
      </div>
      <p className="ed-panel-note" style={{ marginTop: 8, textAlign: 'center' }}>
        Top inbound hubs · highlighted arc = your most-flown origin
      </p>
    </div>
  );
}

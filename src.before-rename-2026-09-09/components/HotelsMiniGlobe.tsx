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
    <div className="card relative overflow-hidden" style={{ minHeight: 280 }}>
      <div className="card-head">
        <div>
          <div className="eyebrow text-cyan-700">Where</div>
          <h2 className="!mb-0">{dest}</h2>
        </div>
        <div className="text-[10px] uppercase tracking-wide text-slate-400">Routes in</div>
      </div>
      <div className="relative" style={{ height: 220 }}>
        <SvgGlobe arcs={arcs} hubCodes={hubCodes} />
      </div>
      <p className="text-[11px] text-slate-500 mt-2 text-center">
        Top inbound hubs · highlighted arc = your most-flown origin
      </p>
    </div>
  );
}

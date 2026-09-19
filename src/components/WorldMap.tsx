import { fmtUSD } from '@/lib/utils';
import { cityName } from '@/lib/explore';

// Approximate IATA city → [lng, lat]. Covers the destinations the Explore
// page typically returns from major hubs. Coordinates are good enough for a
// world-map plot; we equirectangular-project to viewBox 0 0 1000 500.
const CITY_COORDS: Record<string, [number, number]> = {
  // North America
  NYC:[-74.0, 40.7], JFK:[-73.78,40.64], EWR:[-74.17,40.69], LAX:[-118.41,33.94],
  MIA:[-80.29,25.79], ORL:[-81.31,28.43], FLL:[-80.15,26.07], ATL:[-84.43,33.64],
  SFO:[-122.37,37.62], SEA:[-122.31,47.45], LAS:[-115.15,36.08], MEX:[-99.07,19.43],
  CUN:[-86.87,21.04], YYZ:[-79.63,43.68], YUL:[-73.74,45.46], BOS:[-71.0,42.36],
  IAD:[-77.45,38.94], DFW:[-97.04,32.89], ORD:[-87.91,41.97], PHX:[-112.0,33.43],
  // Caribbean
  PUJ:[-68.36,18.57], SDQ:[-69.66,18.46], STI:[-70.6,19.4], SJU:[-66.0,18.43], NAS:[-77.46,25.04],
  // Europe
  LON:[-0.13,51.5], LHR:[-0.45,51.47], LGW:[0.0,51.16], PAR:[2.35,48.85], CDG:[2.55,49.0],
  AMS:[4.76,52.31], FRA:[8.57,50.04], BER:[13.5,52.36], MAD:[-3.57,40.49], BCN:[2.18,41.4],
  ROM:[12.49,41.89], FCO:[12.25,41.8], MIL:[9.19,45.46], LIS:[-9.13,38.78], ATH:[23.94,37.94],
  ZRH:[8.55,47.45], VIE:[16.57,48.11], DUB:[-6.27,53.42], CPH:[12.65,55.62], OSL:[11.1,60.19],
  STO:[18.07,59.65], HEL:[24.96,60.32], IST:[28.81,40.97], MOW:[37.41,55.97], WAW:[20.97,52.17],
  PRG:[14.26,50.1], BUD:[19.26,47.43],
  // Africa / Middle East
  CAI:[31.4,30.12], DXB:[55.36,25.25], AUH:[54.65,24.43], DOH:[51.61,25.27],
  RUH:[46.7,24.96], JED:[39.16,21.68], BEY:[35.49,33.82], TLV:[34.88,32.0],
  RAK:[-8.04,31.6], CMN:[-7.59,33.37], NBO:[36.93,-1.32], JNB:[28.24,-26.13],
  ALG:[3.21,36.69], LOS:[3.32,6.58], CPT:[18.6,-33.97], ADD:[38.8,8.98],
  // Asia
  TYO:[139.78,35.55], NRT:[140.39,35.77], HND:[139.78,35.55], OSA:[135.44,34.43],
  HKG:[113.92,22.31], BKK:[100.75,13.69], SIN:[103.99,1.36], KUL:[101.71,2.74],
  DEL:[77.1,28.55], BOM:[72.86,19.09], TAS:[69.29,41.26], BLR:[77.7,13.2],
  SHA:[121.4,31.19], PEK:[116.59,40.07], ICN:[126.45,37.46], MNL:[121.0,14.51],
  // Oceania
  SYD:[151.18,-33.94], MEL:[144.84,-37.67], BNE:[153.12,-27.38], AKL:[174.79,-37.0],
  // Latin America
  GRU:[-46.47,-23.43], EZE:[-58.53,-34.82], LIM:[-77.11,-12.02], BOG:[-74.14,4.7],
  SCL:[-70.79,-33.39],
};

export type DestPoint = {
  destination: string;
  price: number;
  departure_at?: string | null;
};

function project(lng: number, lat: number, w: number, h: number): [number, number] {
  // Equirectangular: x ∈ [-180,180] → [0,w], y ∈ [90,-90] → [0,h]
  const x = ((lng + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return [x, y];
}

function colorFor(price: number, min: number, max: number): string {
  if (price <= min * 1.15) return '#10b981'; // emerald — cheapest 15%
  if (price <= min * 1.5)  return '#22c55e'; // green
  const range = Math.max(1, max - min);
  const t = (price - min) / range;
  if (t <= 0.4) return '#84cc16';
  if (t <= 0.6) return '#eab308'; // amber
  if (t <= 0.8) return '#f97316'; // orange
  return '#ef4444'; // red
}

export function WorldMap({
  origin,
  destinations,
}: {
  origin: string;
  destinations: DestPoint[];
}) {
  const W = 1000;
  const H = 500;

  const known = destinations.filter(d => CITY_COORDS[d.destination]);
  if (known.length === 0) return null;

  const prices = known.map(d => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  const originCoord = CITY_COORDS[origin] || CITY_COORDS.NYC;
  const [ox, oy] = project(originCoord[0], originCoord[1], W, H);

  return (
    <div className="card !p-0 overflow-hidden bg-gradient-to-b from-[#eaf3ff] to-[#dde9f5] dark:from-slate-900 dark:to-slate-950 border-slate-200 dark:border-slate-700">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow text-brand-700">Explore by map</div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white !mb-0">
            {known.length} destinations from {cityName(origin)}
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-slate-500">Cheaper</span>
          <span className="w-3 h-3 rounded-full" style={{ background: '#10b981' }} />
          <span className="w-3 h-3 rounded-full" style={{ background: '#84cc16' }} />
          <span className="w-3 h-3 rounded-full" style={{ background: '#eab308' }} />
          <span className="w-3 h-3 rounded-full" style={{ background: '#f97316' }} />
          <span className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
          <span className="text-slate-500">Pricier</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" role="img" aria-label="World destinations map">
        {/* Soft graticule background */}
        <defs>
          <pattern id="grid" width="100" height="50" patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 50" fill="none" stroke="rgba(148,163,184,.18)" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="oceanFade" cx="50%" cy="50%" r="60%">
            <stop offset="0%"   stopColor="rgba(165,200,235,.55)" />
            <stop offset="100%" stopColor="rgba(165,200,235,0)" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#grid)" />
        <ellipse cx={W/2} cy={H/2} rx={W/2.2} ry={H/2.2} fill="url(#oceanFade)" />

        {/* Continent shadows — very light hand-drawn approximations
            Real: in production swap for a proper TopoJSON path. For now the
            dots tell the story; the silhouette just provides visual anchor. */}
        <g fill="rgba(148,163,184,.18)">
          {/* North America */}
          <path d="M 90,80 Q 80,140 100,180 L 130,250 Q 200,290 280,260 L 270,200 240,160 220,120 180,90 130,70 Z" />
          {/* South America */}
          <path d="M 270,290 Q 280,340 290,400 L 310,470 340,470 350,400 320,300 Z" />
          {/* Europe */}
          <path d="M 470,90 Q 460,140 480,170 L 540,180 580,150 560,100 510,80 Z" />
          {/* Africa */}
          <path d="M 480,180 Q 480,240 490,300 L 530,400 570,400 590,310 580,230 540,180 Z" />
          {/* Asia */}
          <path d="M 580,90 Q 600,140 650,180 L 750,200 850,170 880,110 800,70 700,80 Z" />
          {/* Oceania */}
          <path d="M 800,360 Q 820,400 870,400 L 910,380 880,340 820,330 Z" />
        </g>

        {/* Route arcs from origin to each destination */}
        <g fill="none" strokeOpacity="0.15" stroke="#0B1220">
          {known.map(d => {
            const [lng, lat] = CITY_COORDS[d.destination];
            const [x, y] = project(lng, lat, W, H);
            const cx = (ox + x) / 2;
            const cy = Math.min(oy, y) - 30;
            return <path key={`arc-${d.destination}`} d={`M ${ox} ${oy} Q ${cx} ${cy} ${x} ${y}`} strokeWidth="1" />;
          })}
        </g>

        {/* Origin dot */}
        <g>
          <circle cx={ox} cy={oy} r="9" fill="rgba(212,175,55,0.18)" />
          <circle cx={ox} cy={oy} r="5" fill="#E8A33D" stroke="white" strokeWidth="1.5" />
        </g>

        {/* Destination dots */}
        {known.map(d => {
          const [lng, lat] = CITY_COORDS[d.destination];
          const [x, y] = project(lng, lat, W, H);
          const r = Math.max(4, 9 - (d.price - min) / Math.max(1, max - min) * 5);
          const fill = colorFor(d.price, min, max);
          return (
            <g key={d.destination} className="cursor-pointer">
              <title>{cityName(d.destination)} · {fmtUSD(d.price)}</title>
              <circle cx={x} cy={y} r={r + 2} fill={fill} fillOpacity="0.25" />
              <circle cx={x} cy={y} r={r} fill={fill} stroke="white" strokeWidth="1" />
              {r >= 7 && (
                <text x={x} y={y - r - 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#0b1220" paintOrder="stroke" stroke="white" strokeWidth="3">
                  {d.destination}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="px-5 py-3 text-[11px] text-slate-500 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between flex-wrap gap-2">
        <span><span className="inline-block w-2 h-2 rounded-full bg-brand-gold mr-1" /> Origin</span>
        <span>Hover any dot for price & city</span>
        <span>{known.length} of {destinations.length} mapped</span>
      </div>
    </div>
  );
}

/* global React */
const { useEffect, useRef, useState, useMemo } = React;

// Approximate lat/lon coords for a handful of cities the app cares about
const CITIES = [
  { code: 'JFK', name: 'New York',  lat:  40.64, lon: -73.78 },
  { code: 'EWR', name: 'Newark',    lat:  40.69, lon: -74.17 },
  { code: 'LAX', name: 'Los Angeles', lat: 33.94, lon: -118.40 },
  { code: 'YYZ', name: 'Toronto',   lat:  43.68, lon: -79.63 },
  { code: 'LHR', name: 'London',    lat:  51.47, lon:  -0.45 },
  { code: 'CDG', name: 'Paris',     lat:  49.00, lon:   2.55 },
  { code: 'FRA', name: 'Frankfurt', lat:  50.04, lon:   8.56 },
  { code: 'IST', name: 'Istanbul',  lat:  41.28, lon:  28.74 },
  { code: 'DXB', name: 'Dubai',     lat:  25.25, lon:  55.36 },
  { code: 'BOM', name: 'Mumbai',    lat:  19.08, lon:  72.86 },
  { code: 'BKK', name: 'Bangkok',   lat:  13.69, lon: 100.75 },
  { code: 'HKG', name: 'Hong Kong', lat:  22.30, lon: 113.91 },
  { code: 'NRT', name: 'Tokyo',     lat:  35.77, lon: 140.39 },
  { code: 'SYD', name: 'Sydney',    lat: -33.94, lon: 151.18 },
  { code: 'GRU', name: 'São Paulo', lat: -23.43, lon: -46.47 },
  { code: 'CAI', name: 'Cairo',     lat:  30.12, lon:  31.40 },
  { code: 'JNB', name: 'Jo\'burg',  lat: -26.13, lon:  28.24 },
  { code: 'NBO', name: 'Nairobi',   lat:  -1.32, lon:  36.93 },
];

// Active arcs we'll animate on the globe
const ARCS = [
  { from: 'JFK', to: 'CAI', priceUsd: 612, hot: true },
  { from: 'EWR', to: 'CAI', priceUsd: 589, hot: true },
  { from: 'LAX', to: 'NRT', priceUsd: 743 },
  { from: 'LHR', to: 'JFK', priceUsd: 412 },
  { from: 'FRA', to: 'BKK', priceUsd: 821 },
  { from: 'YYZ', to: 'CDG', priceUsd: 498 },
  { from: 'JFK', to: 'GRU', priceUsd: 678 },
  { from: 'DXB', to: 'BOM', priceUsd: 198 },
  { from: 'IST', to: 'CAI', priceUsd: 168 },
  { from: 'SYD', to: 'HKG', priceUsd: 533 },
  { from: 'NBO', to: 'JNB', priceUsd: 122 },
];

// Procedural "world landmass" point cloud. We generate dots within an ellipse
// for each continent so the globe reads as Earth without an actual texture.
function generateLandDots() {
  const continents = [
    // [centerLat, centerLon, rangeLat, rangeLon, density]
    { c: [54, -100], r: [22, 35], d: 110 },  // North America
    { c: [10, -65],  r: [22, 12], d: 60 },   // South America
    { c: [50, 15],   r: [12, 25], d: 80 },   // Europe
    { c: [10, 22],   r: [28, 22], d: 110 },  // Africa
    { c: [45, 80],   r: [25, 55], d: 200 },  // Asia
    { c: [-25, 135], r: [10, 15], d: 50 },   // Australia
    { c: [70, 30],   r: [10, 60], d: 60 },   // Russia/Siberia
    { c: [25, 80],   r: [12, 15], d: 40 },   // India/SE
  ];
  const pts = [];
  let seed = 1;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (const cont of continents) {
    for (let i = 0; i < cont.d; i++) {
      const lat = cont.c[0] + (rand() - 0.5) * 2 * cont.r[0];
      const lon = cont.c[1] + (rand() - 0.5) * 2 * cont.r[1];
      pts.push({ lat, lon });
    }
  }
  return pts;
}

const LAND_DOTS = generateLandDots();

// Project (lat,lon) on a sphere rotated by rotLon onto 2D coords centered at (cx,cy) with radius R.
// Returns null if the point is on the back side of the globe.
function project(lat, lon, rotLon, cx, cy, R) {
  const φ = (lat * Math.PI) / 180;
  const λ = ((lon + rotLon) * Math.PI) / 180;
  // 3D coords with Y up
  const x = Math.cos(φ) * Math.sin(λ);
  const y = Math.sin(φ);
  const z = Math.cos(φ) * Math.cos(λ);
  // Back of globe → cull
  if (z < -0.05) return null;
  return {
    x: cx + x * R,
    y: cy - y * R,
    z,
    front: z > 0.05,
  };
}

window.Globe = function Globe({ accentColor = '#d4af37' }) {
  const [rot, setRot] = useState(0);
  const rafRef = useRef();
  const lastRef = useRef(performance.now());

  useEffect(() => {
    const tick = (t) => {
      const dt = (t - lastRef.current) / 1000;
      lastRef.current = t;
      setRot(r => (r + dt * 8) % 360); // 45s per full rotation
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const SIZE = 480;
  const cx = SIZE / 2, cy = SIZE / 2;
  const R = 200;

  // Project all dots
  const dots = useMemo(() => {
    // recomputed each render — cheap enough at ~700 points
    return LAND_DOTS.map(d => project(d.lat, d.lon, rot, cx, cy, R)).filter(Boolean);
  }, [rot]);

  const cityProjs = CITIES.map(c => ({
    ...c,
    proj: project(c.lat, c.lon, rot, cx, cy, R),
  }));

  // Arc paths between cities, curved into 3D space (lifted above the sphere).
  const arcs = ARCS.map((a, i) => {
    const from = CITIES.find(c => c.code === a.from);
    const to   = CITIES.find(c => c.code === a.to);
    if (!from || !to) return null;
    // Sample N points along the great-circle arc
    const N = 32;
    const pts = [];
    for (let s = 0; s <= N; s++) {
      const t = s / N;
      // Interpolate lat/lon (rough but fine visually)
      const lat = from.lat + (to.lat - from.lat) * t;
      const lon = from.lon + (to.lon - from.lon) * t;
      // Lift towards camera near the midpoint
      const lift = Math.sin(t * Math.PI) * 0.35; // 0..0.35
      const φ = (lat * Math.PI) / 180;
      const λ = ((lon + rot) * Math.PI) / 180;
      const x = Math.cos(φ) * Math.sin(λ) * (1 + lift);
      const y = Math.sin(φ) * (1 + lift);
      const z = Math.cos(φ) * Math.cos(λ) * (1 + lift);
      // Only draw points that are at least partially visible
      if (z < -0.5) { pts.push(null); continue; }
      pts.push({ x: cx + x * R, y: cy - y * R, z });
    }
    // Build SVG path, breaking on null gaps
    let d = '';
    pts.forEach((p, idx) => {
      if (!p) return;
      d += (idx === 0 || !pts[idx-1] ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' ';
    });
    // Find midpoint for label position
    const mid = pts[Math.floor(N/2)];
    return { d, hot: a.hot, priceUsd: a.priceUsd, mid, from: a.from, to: a.to, i };
  }).filter(Boolean);

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="100%"
      height="100%"
      style={{ maxWidth: 520, display: 'block' }}
    >
      <defs>
        <radialGradient id="sphereGrad" cx="35%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#1a3866" />
          <stop offset="40%" stopColor="#0a2547" />
          <stop offset="100%" stopColor="#020a1a" />
        </radialGradient>
        <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3fd6c8" stopOpacity=".18" />
          <stop offset="60%" stopColor="#3fd6c8" stopOpacity=".04" />
          <stop offset="100%" stopColor="#3fd6c8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="arcGrad" x1="0" x2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity="0" />
          <stop offset="40%" stopColor={accentColor} stopOpacity=".8" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
        </linearGradient>
        <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>

      {/* Atmosphere glow */}
      <circle cx={cx} cy={cy} r={R + 22} fill="url(#glowGrad)" />

      {/* Sphere */}
      <circle cx={cx} cy={cy} r={R} fill="url(#sphereGrad)" />

      {/* Meridian grid (longitude lines) */}
      {[-60, -30, 0, 30, 60].map(off => {
        const φRad = (off * Math.PI) / 180;
        const rx = R * Math.abs(Math.cos(φRad));
        return (
          <ellipse
            key={`m${off}`}
            cx={cx} cy={cy}
            rx={rx} ry={R}
            fill="none"
            stroke="rgba(212,175,55,.10)"
            strokeWidth="0.5"
          />
        );
      })}
      {/* Parallels (latitude lines) */}
      {[-60, -30, 0, 30, 60].map(lat => {
        const φ = (lat * Math.PI) / 180;
        const ry = R * Math.sin(φ);
        const rx = R * Math.cos(φ);
        return (
          <ellipse
            key={`p${lat}`}
            cx={cx} cy={cy + ry}
            rx={rx} ry={rx * 0.0001 + 0.5}
            fill="none"
            stroke="rgba(212,175,55,.10)"
            strokeWidth="0.5"
          />
        );
      })}
      {/* Equator emphasized */}
      <line
        x1={cx - R} y1={cy} x2={cx + R} y2={cy}
        stroke="rgba(212,175,55,.18)" strokeWidth="0.6"
        strokeDasharray="3 5"
      />

      {/* Landmass stipple dots */}
      {dots.map((p, i) => (
        <circle
          key={i}
          cx={p.x} cy={p.y} r={p.front ? 1.2 : 0.8}
          fill={p.front ? 'rgba(63,214,200,.55)' : 'rgba(63,214,200,.18)'}
        />
      ))}

      {/* Sphere terminator shading (subtle) */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="url(#shading)"
        style={{ mixBlendMode: 'multiply' }}
      />

      {/* Flight arcs */}
      {arcs.map(a => (
        <g key={a.i}>
          <path
            d={a.d}
            fill="none"
            stroke={a.hot ? accentColor : 'rgba(63,214,200,.55)'}
            strokeWidth={a.hot ? 1.6 : 1}
            strokeLinecap="round"
            style={{ filter: a.hot ? 'drop-shadow(0 0 4px rgba(212,175,55,.55))' : 'none' }}
            opacity={a.hot ? 1 : 0.7}
          />
          {/* Pulse traveling along arc */}
          <circle r="3" fill={a.hot ? accentColor : '#3fd6c8'}>
            <animateMotion
              dur={`${4 + a.i * 0.4}s`}
              repeatCount="indefinite"
              path={a.d}
            />
            <animate
              attributeName="opacity"
              dur={`${4 + a.i * 0.4}s`}
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.1;0.9;1"
            />
          </circle>
        </g>
      ))}

      {/* City pins */}
      {cityProjs.map(c => {
        if (!c.proj || !c.proj.front) return null;
        const isHub = c.code === 'CAI' || c.code === 'JFK' || c.code === 'EWR';
        return (
          <g key={c.code}>
            <circle
              cx={c.proj.x} cy={c.proj.y}
              r={isHub ? 4 : 2.2}
              fill={isHub ? accentColor : '#3fd6c8'}
              stroke={isHub ? 'rgba(212,175,55,.4)' : 'rgba(63,214,200,.4)'}
              strokeWidth={isHub ? 3 : 2}
              style={{ filter: isHub ? `drop-shadow(0 0 6px ${accentColor})` : 'none' }}
            />
            {isHub && (
              <text
                x={c.proj.x + 8} y={c.proj.y - 8}
                fill={accentColor}
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="600"
                letterSpacing="0.1em"
              >
                {c.code}
              </text>
            )}
          </g>
        );
      })}

      {/* Subtle highlight rim */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke="rgba(63,214,200,.18)"
        strokeWidth="0.8"
      />
    </svg>
  );
};

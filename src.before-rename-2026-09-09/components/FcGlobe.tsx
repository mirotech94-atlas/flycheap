'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

type City = { code: string; name: string; lat: number; lon: number };
type Arc = { from: string; to: string; priceUsd: number; hot?: boolean };

const CITIES: City[] = [
  { code: 'JFK', name: 'New York', lat: 40.64, lon: -73.78 },
  { code: 'EWR', name: 'Newark', lat: 40.69, lon: -74.17 },
  { code: 'LAX', name: 'Los Angeles', lat: 33.94, lon: -118.40 },
  { code: 'YYZ', name: 'Toronto', lat: 43.68, lon: -79.63 },
  { code: 'LHR', name: 'London', lat: 51.47, lon: -0.45 },
  { code: 'CDG', name: 'Paris', lat: 49.00, lon: 2.55 },
  { code: 'FRA', name: 'Frankfurt', lat: 50.04, lon: 8.56 },
  { code: 'IST', name: 'Istanbul', lat: 41.28, lon: 28.74 },
  { code: 'DXB', name: 'Dubai', lat: 25.25, lon: 55.36 },
  { code: 'BOM', name: 'Mumbai', lat: 19.08, lon: 72.86 },
  { code: 'BKK', name: 'Bangkok', lat: 13.69, lon: 100.75 },
  { code: 'HKG', name: 'Hong Kong', lat: 22.30, lon: 113.91 },
  { code: 'NRT', name: 'Tokyo', lat: 35.77, lon: 140.39 },
  { code: 'SYD', name: 'Sydney', lat: -33.94, lon: 151.18 },
  { code: 'GRU', name: 'São Paulo', lat: -23.43, lon: -46.47 },
  { code: 'CAI', name: 'Cairo', lat: 30.12, lon: 31.40 },
  { code: 'JNB', name: "Jo'burg", lat: -26.13, lon: 28.24 },
  { code: 'NBO', name: 'Nairobi', lat: -1.32, lon: 36.93 },
];

const ARCS: Arc[] = [
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

function generateLandDots(): { lat: number; lon: number }[] {
  const continents = [
    { c: [54, -100], r: [22, 35], d: 110 },
    { c: [10, -65], r: [22, 12], d: 60 },
    { c: [50, 15], r: [12, 25], d: 80 },
    { c: [10, 22], r: [28, 22], d: 110 },
    { c: [45, 80], r: [25, 55], d: 200 },
    { c: [-25, 135], r: [10, 15], d: 50 },
    { c: [70, 30], r: [10, 60], d: 60 },
    { c: [25, 80], r: [12, 15], d: 40 },
  ];
  const pts: { lat: number; lon: number }[] = [];
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

type Proj = { x: number; y: number; z: number; front: boolean };

function project(lat: number, lon: number, rotLon: number, cx: number, cy: number, R: number): Proj | null {
  const phi = (lat * Math.PI) / 180;
  const lam = ((lon + rotLon) * Math.PI) / 180;
  const x = Math.cos(phi) * Math.sin(lam);
  const y = Math.sin(phi);
  const z = Math.cos(phi) * Math.cos(lam);
  if (z < -0.05) return null;
  return { x: cx + x * R, y: cy - y * R, z, front: z > 0.05 };
}

export function FcGlobe({ accentColor = '#d4af37' }: { accentColor?: string }) {
  const [rot, setRot] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    lastRef.current = performance.now();
    const tick = (t: number) => {
      const dt = (t - lastRef.current) / 1000;
      lastRef.current = t;
      setRot(r => (r + dt * 8) % 360);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const SIZE = 480;
  const cx = SIZE / 2, cy = SIZE / 2;
  const R = 200;

  const dots = useMemo(
    () => LAND_DOTS.map(d => project(d.lat, d.lon, rot, cx, cy, R)).filter((p): p is Proj => p !== null),
    [rot, cx, cy]
  );

  const cityProjs = CITIES.map(c => ({ ...c, proj: project(c.lat, c.lon, rot, cx, cy, R) }));

  const arcs = ARCS.map((a, i) => {
    const from = CITIES.find(c => c.code === a.from);
    const to = CITIES.find(c => c.code === a.to);
    if (!from || !to) return null;
    const N = 32;
    const pts: ({ x: number; y: number; z: number } | null)[] = [];
    for (let s = 0; s <= N; s++) {
      const t = s / N;
      const lat = from.lat + (to.lat - from.lat) * t;
      const lon = from.lon + (to.lon - from.lon) * t;
      const lift = Math.sin(t * Math.PI) * 0.35;
      const phi = (lat * Math.PI) / 180;
      const lam = ((lon + rot) * Math.PI) / 180;
      const x = Math.cos(phi) * Math.sin(lam) * (1 + lift);
      const y = Math.sin(phi) * (1 + lift);
      const z = Math.cos(phi) * Math.cos(lam) * (1 + lift);
      if (z < -0.5) { pts.push(null); continue; }
      pts.push({ x: cx + x * R, y: cy - y * R, z });
    }
    let d = '';
    pts.forEach((p, idx) => {
      if (!p) return;
      d += (idx === 0 || !pts[idx - 1] ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' ';
    });
    return { d, hot: !!a.hot, priceUsd: a.priceUsd, from: a.from, to: a.to, i };
  }).filter((a): a is { d: string; hot: boolean; priceUsd: number; from: string; to: string; i: number } => a !== null);

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="100%"
      height="100%"
      style={{ maxWidth: 520, display: 'block' }}
    >
      <defs>
        <radialGradient id="fcSphereGrad" cx="35%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#1a3866" />
          <stop offset="40%" stopColor="#0a2547" />
          <stop offset="100%" stopColor="#020a1a" />
        </radialGradient>
        <radialGradient id="fcGlowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3fd6c8" stopOpacity=".18" />
          <stop offset="60%" stopColor="#3fd6c8" stopOpacity=".04" />
          <stop offset="100%" stopColor="#3fd6c8" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r={R + 22} fill="url(#fcGlowGrad)" />
      <circle cx={cx} cy={cy} r={R} fill="url(#fcSphereGrad)" />

      {[-60, -30, 0, 30, 60].map(off => {
        const phiRad = (off * Math.PI) / 180;
        const rx = R * Math.abs(Math.cos(phiRad));
        return (
          <ellipse key={`m${off}`} cx={cx} cy={cy} rx={rx} ry={R}
            fill="none" stroke="rgba(212,175,55,.10)" strokeWidth="0.5" />
        );
      })}
      {[-60, -30, 0, 30, 60].map(lat => {
        const phi = (lat * Math.PI) / 180;
        const ry = R * Math.sin(phi);
        const rx = R * Math.cos(phi);
        return (
          <ellipse key={`p${lat}`} cx={cx} cy={cy + ry} rx={rx} ry={rx * 0.0001 + 0.5}
            fill="none" stroke="rgba(212,175,55,.10)" strokeWidth="0.5" />
        );
      })}
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy}
        stroke="rgba(212,175,55,.18)" strokeWidth="0.6" strokeDasharray="3 5" />

      {dots.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.front ? 1.2 : 0.8}
          fill={p.front ? 'rgba(63,214,200,.55)' : 'rgba(63,214,200,.18)'} />
      ))}

      {arcs.map(a => (
        <g key={a.i}>
          <path d={a.d} fill="none"
            stroke={a.hot ? accentColor : 'rgba(63,214,200,.55)'}
            strokeWidth={a.hot ? 1.6 : 1}
            strokeLinecap="round"
            style={{ filter: a.hot ? 'drop-shadow(0 0 4px rgba(212,175,55,.55))' : 'none' }}
            opacity={a.hot ? 1 : 0.7} />
          <circle r="3" fill={a.hot ? accentColor : '#3fd6c8'}>
            <animateMotion dur={`${4 + a.i * 0.4}s`} repeatCount="indefinite" path={a.d} />
            <animate attributeName="opacity" dur={`${4 + a.i * 0.4}s`} repeatCount="indefinite"
              values="0;1;1;0" keyTimes="0;0.1;0.9;1" />
          </circle>
        </g>
      ))}

      {cityProjs.map(c => {
        if (!c.proj || !c.proj.front) return null;
        const isHub = c.code === 'CAI' || c.code === 'JFK' || c.code === 'EWR';
        return (
          <g key={c.code}>
            <circle cx={c.proj.x} cy={c.proj.y}
              r={isHub ? 4 : 2.2}
              fill={isHub ? accentColor : '#3fd6c8'}
              stroke={isHub ? 'rgba(212,175,55,.4)' : 'rgba(63,214,200,.4)'}
              strokeWidth={isHub ? 3 : 2}
              style={{ filter: isHub ? `drop-shadow(0 0 6px ${accentColor})` : 'none' }} />
            {isHub && (
              <text x={c.proj.x + 8} y={c.proj.y - 8}
                fill={accentColor} fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="600" letterSpacing="0.1em">
                {c.code}
              </text>
            )}
          </g>
        );
      })}

      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(63,214,200,.18)" strokeWidth="0.8" />
    </svg>
  );
}

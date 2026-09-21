'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type GlobeArc = { from: string; to: string; hot?: boolean };

const CITIES: Record<string, { name: string; lat: number; lon: number }> = {
  JFK: { name: 'New York',   lat:  40.64, lon: -73.78 },
  EWR: { name: 'Newark',     lat:  40.69, lon: -74.17 },
  LAX: { name: 'Los Angeles',lat:  33.94, lon: -118.40 },
  ORD: { name: 'Chicago',    lat:  41.97, lon: -87.91 },
  IAH: { name: 'Houston',    lat:  29.99, lon: -95.34 },
  YYZ: { name: 'Toronto',    lat:  43.68, lon: -79.63 },
  LHR: { name: 'London',     lat:  51.47, lon:  -0.45 },
  CDG: { name: 'Paris',      lat:  49.00, lon:   2.55 },
  FRA: { name: 'Frankfurt',  lat:  50.04, lon:   8.56 },
  AMS: { name: 'Amsterdam',  lat:  52.31, lon:   4.76 },
  IST: { name: 'Istanbul',   lat:  41.28, lon:  28.74 },
  DXB: { name: 'Dubai',      lat:  25.25, lon:  55.36 },
  DOH: { name: 'Doha',       lat:  25.27, lon:  51.61 },
  BOM: { name: 'Mumbai',     lat:  19.08, lon:  72.86 },
  DEL: { name: 'Delhi',      lat:  28.56, lon:  77.10 },
  BKK: { name: 'Bangkok',    lat:  13.69, lon: 100.75 },
  HKG: { name: 'Hong Kong',  lat:  22.30, lon: 113.91 },
  NRT: { name: 'Tokyo',      lat:  35.77, lon: 140.39 },
  ICN: { name: 'Seoul',      lat:  37.46, lon: 126.44 },
  SYD: { name: 'Sydney',     lat: -33.94, lon: 151.18 },
  GRU: { name: 'São Paulo',  lat: -23.43, lon: -46.47 },
  CAI: { name: 'Cairo',      lat:  30.12, lon:  31.40 },
  JNB: { name: "J'burg",     lat: -26.13, lon:  28.24 },
  NBO: { name: 'Nairobi',    lat:  -1.32, lon:  36.93 },
  ATH: { name: 'Athens',     lat:  37.94, lon:  23.94 },
  AMM: { name: 'Amman',      lat:  31.72, lon:  35.99 },
};

function generateLandDots() {
  const continents = [
    { c: [54, -100] as [number, number], r: [22, 35], d: 110 },
    { c: [10, -65]  as [number, number], r: [22, 12], d: 60  },
    { c: [50, 15]   as [number, number], r: [12, 25], d: 80  },
    { c: [10, 22]   as [number, number], r: [28, 22], d: 110 },
    { c: [45, 80]   as [number, number], r: [25, 55], d: 200 },
    { c: [-25, 135] as [number, number], r: [10, 15], d: 50  },
    { c: [70, 30]   as [number, number], r: [10, 60], d: 60  },
    { c: [25, 80]   as [number, number], r: [12, 15], d: 40  },
  ];
  const pts: { lat: number; lon: number }[] = [];
  let seed = 1;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (const cont of continents) {
    for (let i = 0; i < cont.d; i++) {
      pts.push({
        lat: cont.c[0] + (rand() - 0.5) * 2 * cont.r[0],
        lon: cont.c[1] + (rand() - 0.5) * 2 * cont.r[1],
      });
    }
  }
  return pts;
}
const LAND = generateLandDots();

function project(lat: number, lon: number, rotLon: number, cx: number, cy: number, R: number) {
  const phi = (lat * Math.PI) / 180;
  const lam = ((lon + rotLon) * Math.PI) / 180;
  const x = Math.cos(phi) * Math.sin(lam);
  const y = Math.sin(phi);
  const z = Math.cos(phi) * Math.cos(lam);
  if (z < -0.05) return null;
  return { x: cx + x * R, y: cy - y * R, z, front: z > 0.05 };
}

export function SvgGlobe({
  arcs,
  hubCodes = ['CAI', 'JFK', 'EWR'],
  accent = 'var(--accent)',
}: {
  arcs: GlobeArc[];
  hubCodes?: string[];
  accent?: string;
}) {
  const [rot, setRot] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  const last = useRef<number>(0);

  useEffect(() => {
    last.current = performance.now();
    const tick = (t: number) => {
      const dt = (t - last.current) / 1000;
      last.current = t;
      setRot(r => (r + dt * 8) % 360);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  const SIZE = 480;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = 200;

  const dots = useMemo(
    () => LAND.map(d => project(d.lat, d.lon, rot, cx, cy, R)).filter(Boolean),
    [rot]
  );

  const cityProjs = Object.entries(CITIES).map(([code, c]) => ({
    code, ...c, proj: project(c.lat, c.lon, rot, cx, cy, R),
  }));

  const arcPaths = arcs.map((a, i) => {
    const from = CITIES[a.from];
    const to = CITIES[a.to];
    if (!from || !to) return null;
    const N = 32;
    const pts: ({ x: number; y: number } | null)[] = [];
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
      pts.push({ x: cx + x * R, y: cy - y * R });
    }
    let d = '';
    pts.forEach((p, idx) => {
      if (!p) return;
      d += (idx === 0 || !pts[idx - 1] ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' ';
    });
    return { d, hot: !!a.hot, i };
  }).filter((x): x is { d: string; hot: boolean; i: number } => !!x);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%" style={{ maxWidth: 520, display: 'block' }}>
      {/* Sphere + halo used to be two radialGradients (deep-navy sphere,
          soft teal glow). No gradients in the editorial system — flat token
          fills keep the same silhouette: `--surface-2` for the sphere body
          (not `--panel-bg` — that stays dark in both themes, and the accent/
          muted markers drawn on top are only AA-safe against the page's own
          surface family) with a faint accent-tinted halo instead of a
          blurred glow. */}
      <circle cx={cx} cy={cy} r={R + 22} fill="color-mix(in srgb, var(--accent) 10%, transparent)" />
      <circle cx={cx} cy={cy} r={R} fill="var(--surface-2)" />

      {[-60, -30, 0, 30, 60].map(off => {
        const phi = (off * Math.PI) / 180;
        return (
          <ellipse key={`m${off}`} cx={cx} cy={cy}
            rx={R * Math.abs(Math.cos(phi))} ry={R}
            fill="none" stroke="var(--rule)" strokeWidth="0.5" />
        );
      })}
      {[-60, -30, 0, 30, 60].map(lat => {
        const phi = (lat * Math.PI) / 180;
        const ry = R * Math.sin(phi);
        const rx = R * Math.cos(phi);
        return (
          <ellipse key={`p${lat}`} cx={cx} cy={cy + ry}
            rx={rx} ry={rx * 0.0001 + 0.5}
            fill="none" stroke="var(--rule)" strokeWidth="0.5" />
        );
      })}
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy}
        stroke="var(--rule-strong)" strokeWidth="0.6" strokeDasharray="3 5" />

      {/* Landmass texture dots — the neutral base tone. Hub/hot highlights
          use `accent`; everything else (land texture, regular arcs/cities)
          uses `--muted` so amber/accent stay reserved for the featured
          route, per the fares/primary-only token roles. */}
      {dots.map((p, i) => p && (
        <circle key={i} cx={p.x} cy={p.y} r={p.front ? 1.2 : 0.8}
          fill={p.front ? 'color-mix(in srgb, var(--muted) 55%, transparent)' : 'color-mix(in srgb, var(--muted) 18%, transparent)'} />
      ))}

      {arcPaths.map(a => (
        <g key={a.i}>
          <path d={a.d} fill="none"
            stroke={a.hot ? accent : 'color-mix(in srgb, var(--muted) 55%, transparent)'}
            strokeWidth={a.hot ? 1.6 : 1}
            strokeLinecap="round"
            opacity={a.hot ? 1 : 0.7} />
          <circle r="3" fill={a.hot ? accent : 'var(--muted)'}>
            <animateMotion dur={`${4 + a.i * 0.4}s`} repeatCount="indefinite" path={a.d} />
            <animate attributeName="opacity" dur={`${4 + a.i * 0.4}s`}
              repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.1;0.9;1" />
          </circle>
        </g>
      ))}

      {cityProjs.map(c => {
        if (!c.proj || !c.proj.front) return null;
        const isHub = hubCodes.includes(c.code);
        return (
          <g key={c.code}>
            <circle cx={c.proj.x} cy={c.proj.y}
              r={isHub ? 4 : 2.2}
              fill={isHub ? accent : 'var(--muted)'}
              stroke={isHub ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'color-mix(in srgb, var(--muted) 40%, transparent)'}
              strokeWidth={isHub ? 3 : 2} />
            {isHub && (
              <text x={c.proj.x + 8} y={c.proj.y - 8}
                fill={accent} fontSize="10"
                style={{ fontFamily: 'var(--font-mono-ed)' }}
                fontWeight="600" letterSpacing="0.1em">
                {c.code}
              </text>
            )}
          </g>
        );
      })}

      <circle cx={cx} cy={cy} r={R} fill="none"
        stroke="var(--rule)" strokeWidth="0.8" />
    </svg>
  );
}

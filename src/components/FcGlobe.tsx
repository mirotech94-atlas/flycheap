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

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function project(lat: number, lon: number, rotLon: number, cx: number, cy: number, R: number): Proj | null {
  const phi = (lat * Math.PI) / 180;
  const lam = ((lon + rotLon) * Math.PI) / 180;
  const x = Math.cos(phi) * Math.sin(lam);
  const y = Math.sin(phi);
  const z = Math.cos(phi) * Math.cos(lam);
  if (z < -0.05) return null;
  // Rounded because Math.sin/cos differ between Node and the browser in the last
  // couple of ULPs, and React then reports a hydration mismatch on every landmass
  // dot ("this won't be patched up"). 3dp is far below a pixel on a 480 viewBox.
  return { x: round3(cx + x * R), y: round3(cy - y * R), z, front: z > 0.05 };
}

export function FcGlobe({
  accentColor = 'var(--amber)',
  arcColor = 'var(--accent)',
}: { accentColor?: string; arcColor?: string }) {
  // rot drives the render, so it has to be state. The POINTER does not: it is
  // damped every frame and only read while drawing, so it lives in a ref and
  // never schedules a render of its own.
  const [frame, setFrame] = useState({ rot: 0, px: 0, py: 0 });
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const ptr = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Off-screen it costs nothing. This matters more here than usual: the globe
    // re-renders ~400 nodes per frame, so an unseen one was burning a full
    // React pass 60x a second behind whatever you were actually looking at.
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    if (svgRef.current) io.observe(svgRef.current);

    lastRef.current = performance.now();
    const tick = (t: number) => {
      rafRef.current = requestAnimationFrame(tick);
      // Clamped so an alt-tab costs a pause rather than a jump.
      const dt = Math.min((t - lastRef.current) / 1000, 0.05);
      lastRef.current = t;
      if (!visible || document.hidden) return;

      const p = ptr.current;
      // One frame-rate-independent damp. The lag IS the weight — the globe
      // arrives a beat after your hand instead of being welded to it.
      const k = 1 - Math.exp(-4.2 * dt);
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;

      setFrame(f => ({
        rot: reduce.matches ? f.rot : (f.rot + dt * 8) % 360,
        px: p.x,
        py: p.y,
      }));
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      io.disconnect();
    };
  }, []);

  const { rot, px, py } = frame;

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

  // The pointer in the svg's own coordinates — what the proximity light measures against.
  const pxSvg = cx + px * R * 0.9;
  const pySvg = cy + py * R * 0.9;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="100%"
      height="100%"
      style={{
        maxWidth: 520,
        display: 'block',
        // Parallax, not rotation. Turning the sphere toward the cursor fights the
        // ambient spin; shifting it reads as the globe sitting in space that your
        // hand moves through. 7px is under a degree of apparent swing.
        transform: `translate(${(px * 7).toFixed(2)}px, ${(py * 7).toFixed(2)}px)`,
        willChange: 'transform',
      }}
      onPointerMove={e => {
        const r = e.currentTarget.getBoundingClientRect();
        if (!r.width || !r.height) return;
        ptr.current.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        ptr.current.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      }}
      onPointerLeave={() => { ptr.current.tx = 0; ptr.current.ty = 0; }}
    >
      <defs>
        <radialGradient id="fcGlowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity=".18" />
          <stop offset="60%" stopColor="var(--accent)" stopOpacity=".04" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r={R + 22} fill="url(#fcGlowGrad)" />
      <circle cx={cx} cy={cy} r={R} fill="var(--surface)" />

      {[-60, -30, 0, 30, 60].map(off => {
        const phiRad = (off * Math.PI) / 180;
        const rx = R * Math.abs(Math.cos(phiRad));
        return (
          <ellipse key={`m${off}`} cx={cx} cy={cy} rx={rx} ry={R}
            fill="none" stroke="var(--rule)" strokeWidth="0.5" />
        );
      })}
      {[-60, -30, 0, 30, 60].map(lat => {
        const phi = (lat * Math.PI) / 180;
        const ry = R * Math.sin(phi);
        const rx = R * Math.cos(phi);
        return (
          <ellipse key={`p${lat}`} cx={cx} cy={cy + ry} rx={rx} ry={rx * 0.0001 + 0.5}
            fill="none" stroke="var(--rule)" strokeWidth="0.5" />
        );
      })}
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy}
        stroke="var(--rule-strong)" strokeWidth="0.6" strokeDasharray="3 5" />

      {/* Proximity light. Vesper disturbs its orb by the ANGLE between the
          cursor and each point, with a smooth falloff; flattened to this
          projection that is just distance in svg units. Only front-facing land
          lights, so the far hemisphere does not glow through the sphere. */}
      {dots.map((p, i) => {
        const near = p.front
          ? Math.max(0, 1 - Math.hypot(p.x - pxSvg, p.y - pySvg) / 96)
          : 0;
        // Cubed, not squared: a tighter pool still. And the light is PALE, not
        // amber — amber means a fare. A cursor glow is decoration, and tinting
        // 400 land dots with the fare colour is exactly the failure the
        // reserved-accent rule exists to prevent.
        const lit = near * near * near;
        return (
          <circle key={i} cx={p.x} cy={p.y}
            r={(p.front ? 1.2 : 0.8) + lit * 0.8}
            fill={lit > 0.06 ? 'var(--ink)' : arcColor}
            fillOpacity={(p.front ? 0.55 : 0.18) + lit * 0.42} />
        );
      })}

      {/* THE SCAN. Range rings around the hub with a ping running out through
          them — Kimi's instrument-panel move, which is a poll made visible:
          something leaves the hub, reaches, and is gone. Only drawn while the
          hub is on the near face, or it would sit over the sphere like a
          sticker instead of on the ground. */}
      {(() => {
        const hub = cityProjs.find(c => c.code === 'CAI');
        if (!hub?.proj?.front) return null;
        return (
          <g key="scan">
            {[24, 44, 68].map((r, i) => (
              <circle key={r} cx={hub.proj!.x} cy={hub.proj!.y} r={r} fill="none"
                stroke={i === 1 ? 'var(--rule-strong)' : 'var(--rule)'}
                strokeWidth="0.6" />
            ))}
            <circle className="fc-globe-ping" cx={hub.proj!.x} cy={hub.proj!.y}
              r={6} fill="none" stroke={accentColor} strokeWidth="0.9" />
          </g>
        );
      })()}

      {arcs.map(a => (
        <g key={a.i}>
          <path d={a.d} fill="none"
            stroke={a.hot ? accentColor : arcColor}
            strokeWidth={a.hot ? 1.6 : 1}
            strokeLinecap="round"
            opacity={a.hot ? 1 : 0.4} />
          {/* The poll head. Kimi fills its lap by stroking the SAME path under an
              animated dash mask rather than moving a token along it, and that is
              what this needed: `d` is rebuilt every frame as the globe turns, so
              the <animateMotion> this replaces was restarting its path
              constantly. pathLength=1 normalises the dash to the arc's own
              length, so the animation survives `d` changing underneath it. */}
          <path d={a.d} fill="none" pathLength={1}
            className="fc-globe-poll"
            stroke={a.hot ? accentColor : arcColor}
            strokeWidth={a.hot ? 2.4 : 1.7}
            strokeLinecap="round"
            strokeDasharray="0.1 1"
            style={{ animationDelay: `${(a.i * 0.42).toFixed(2)}s` }} />
        </g>
      ))}

      {cityProjs.map(c => {
        if (!c.proj || !c.proj.front) return null;
        const isHub = c.code === 'CAI' || c.code === 'JFK' || c.code === 'EWR';
        return (
          <g key={c.code}>
            <circle cx={c.proj.x} cy={c.proj.y}
              r={isHub ? 4 : 2.2}
              fill={isHub ? accentColor : arcColor}
              stroke={isHub ? accentColor : arcColor}
              strokeOpacity={0.4}
              strokeWidth={isHub ? 3 : 2} />
            {isHub && (
              <text x={c.proj.x + 8} y={c.proj.y - 8}
                fill={accentColor} fontSize="10"
                style={{ fontFamily: 'var(--font-mono-ed)' }}
                fontWeight="600" letterSpacing="0.1em">
                {c.code}
              </text>
            )}
          </g>
        );
      })}

      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--accent)" strokeOpacity={0.18} strokeWidth="0.8" />
    </svg>
  );
}

'use client';

/**
 * Always-on interactive globe HUD.
 *
 * Renders a Three.js globe (via react-globe.gl) with brand-tinted point-cloud
 * landmasses, animated arcs, and a CSS chrome overlay (corner brackets,
 * scanlines, telemetry readouts) that gives it the "cinematic command-deck"
 * feel from the design reference.
 *
 * The component subscribes to GlobeStore — chat / search / explore push focus
 * targets, arcs, and readouts; this component reflects them with smooth
 * camera transitions and pulse animations.
 */

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGlobe } from '@/lib/globeStore';
import { hexToRgbTriple, contrastSafe } from '@/lib/brandContrast';

// react-globe.gl pulls Three.js + WebGL — must be client-only.
const Globe = dynamic(() => import('react-globe.gl').then(m => m.default), { ssr: false });

// Hex landmasses dataset — small static GeoJSON-like file shipped with
// react-globe.gl examples. We pull the world atlas at runtime (cached) so we
// don't bloat the bundle. The URL is a public CDN-hosted topojson.
const LAND_TOPO_URL =
  'https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/datasets/ne_110m_admin_0_countries.geojson';

type LandFeature = { type: string; properties: Record<string, unknown>; geometry: unknown };

/**
 * react-globe.gl / three-globe resolve colour props once, as literal Three.js
 * Color strings — a CSS custom property string can't be handed to them
 * directly (same constraint SatelliteExploreMap's maplibre layers have).
 * Read the editorial tokens once on mount and re-read whenever `data-theme`
 * flips, the same pattern charts.tsx's `useChartTokens` uses. Nothing that
 * needs a literal colour renders until the first read succeeds.
 *
 * The HUD itself sits on `--panel-bg` (globals.css's `.globe-hud`), which
 * stays dark in BOTH themes — raw `--accent` measures 2.49:1 against it in
 * light mode, below the WCAG floor even for non-text. That file's own
 * comment documents the fix (task-2.12-report.md): lift every token toward
 * `--panel-fg` until it clears contrast against the panel it is actually
 * drawn on. `contrastSafe` (brandContrast.ts) is that same "keep the hue,
 * move the lightness" walk, reused here for the globe's own literal props.
 */
type GlobeTokens = { accent: string; amber: string; green: string; red: string; accentRgb: string; amberRgb: string };

function useGlobeTokens(): GlobeTokens | null {
  const [tokens, setTokens] = useState<GlobeTokens | null>(null);

  useEffect(() => {
    const read = () => {
      const css = getComputedStyle(document.documentElement);
      const panelBg = css.getPropertyValue('--panel-bg').trim();
      const panelFg = css.getPropertyValue('--panel-fg').trim();
      const rawAccent = css.getPropertyValue('--accent').trim();
      const rawAmber = css.getPropertyValue('--amber').trim();
      const rawGreen = css.getPropertyValue('--green').trim();
      const rawRed = css.getPropertyValue('--red').trim();
      if (!panelBg || !panelFg || !rawAccent || !rawAmber || !rawGreen || !rawRed) return;
      const accent = contrastSafe(rawAccent, panelBg, { min: 3, fallback: panelFg });
      const amber = contrastSafe(rawAmber, panelBg, { min: 3, fallback: panelFg });
      const green = contrastSafe(rawGreen, panelBg, { min: 3, fallback: panelFg });
      const red = contrastSafe(rawRed, panelBg, { min: 3, fallback: panelFg });
      setTokens({ accent, amber, green, red, accentRgb: hexToRgbTriple(accent), amberRgb: hexToRgbTriple(amber) });
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  return tokens;
}

// Fare-price tiers for the point-cloud / arcs — literal tokens (see
// useGlobeTokens above). Amber covers "no data yet" the way the token roles
// use it for a neutral "wait" state; green/red are the two-sided cheap/pricey
// read, with the original code's outer thresholds (900, 1600) kept as the
// boundary between them since editorial only carries three data colours
// where night-cabin's version used five.
function colorForPrice(price: number | undefined, tokens: GlobeTokens): string {
  if (!price) return tokens.amber;
  if (price < 900) return tokens.green;
  if (price < 1600) return tokens.amber;
  return tokens.red;
}

export function GlobeHUD() {
  const {
    focus, arcs, points, readouts, statusLine, pulse, speaking, listening,
  } = useGlobe();
  const tokens = useGlobeTokens();

  const globeRef = useRef<unknown>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [landFeatures, setLandFeatures] = useState<LandFeature[]>([]);
  const [size, setSize] = useState({ w: 420, h: 520 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Only render while FarePilot is actively engaged (mic open OR voice speaking).
  // When idle the HUD stays out of the way — empty globe used to show as a
  // black orb that confused users. Linger for 5s after speech ends so users
  // can finish reading the readouts.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (speaking || listening) { setVisible(true); return; }
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [speaking, listening]);
  // NOTE: the `if (!visible) return null` used to sit HERE, above six more
  // hooks. Hooks must run in the same order on every render, so the first
  // time the HUD became visible (mic open) React saw more hooks than the
  // render before and threw its hook-order error, taking the page down with "This
  // page couldn't load". The early return now lives just before the JSX,
  // after every hook has run. Same visible behaviour, no crash.

  // Fetch landmass topology once.
  useEffect(() => {
    let aborted = false;
    fetch(LAND_TOPO_URL)
      .then(r => r.json())
      .then((j: { features?: LandFeature[] }) => {
        if (!aborted && j.features) setLandFeatures(j.features);
      })
      .catch(() => { /* offline — globe still renders, just without land */ });
    return () => { aborted = true; };
  }, []);

  // Track wrapper size so the canvas is always crisp.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(280, r.width), h: Math.max(320, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Camera ease to focus target whenever it changes.
  useEffect(() => {
    if (!focus || !globeRef.current) return;
    const g = globeRef.current as {
      pointOfView: (pov: { lat: number; lng: number; altitude?: number }, ms?: number) => void;
    };
    g.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: focus.altitude ?? 2.2 }, 1400);
  }, [focus]);

  // Slow auto-rotate when idle; stop while user is speaking/listening.
  useEffect(() => {
    if (!globeRef.current) return;
    const g = globeRef.current as {
      controls: () => { autoRotate: boolean; autoRotateSpeed: number };
    };
    const c = g.controls();
    c.autoRotate = !speaking && !listening;
    c.autoRotateSpeed = speaking ? 0 : 0.35;
  }, [speaking, listening]);

  // Pulse the focus point on every reactToReply.
  const [pulseRing, setPulseRing] = useState<{ lat: number; lng: number; key: number } | null>(null);
  useEffect(() => {
    if (!focus) return;
    setPulseRing({ lat: focus.lat, lng: focus.lng, key: pulse });
    const t = setTimeout(() => setPulseRing(null), 2400);
    return () => clearTimeout(t);
  }, [pulse, focus]);

  const pointsData = useMemo(
    () => (!tokens ? [] : points.map(p => ({
      lat: p.lat, lng: p.lng, label: p.label || p.iata || '', iata: p.iata,
      size: 0.28 + (p.intensity ?? 0.6) * 0.4,
      color: colorForPrice(p.price, tokens),
    }))),
    [points, tokens]
  );

  const arcsData = useMemo(
    () => (!tokens ? [] : arcs.map(a => ({
      startLat: a.startLat, startLng: a.startLng,
      endLat: a.endLat, endLng: a.endLng,
      color: [colorForPrice(a.price, tokens), tokens.amber],
      label: a.label,
    }))),
    [arcs, tokens]
  );

  const ringsData = useMemo(
    () => (pulseRing ? [{ lat: pulseRing.lat, lng: pulseRing.lng }] : []),
    [pulseRing]
  );

  if (!visible) return null;

  return (
    <aside
      className={`globe-hud no-print ${collapsed ? 'globe-hud--collapsed' : ''} ${speaking ? 'globe-hud--speaking' : ''} ${listening ? 'globe-hud--listening' : ''}`}
      aria-label="Concierge globe HUD"
    >
      <div className="globe-hud__chrome">
        <span className="globe-hud__bracket globe-hud__bracket--tl" />
        <span className="globe-hud__bracket globe-hud__bracket--tr" />
        <span className="globe-hud__bracket globe-hud__bracket--bl" />
        <span className="globe-hud__bracket globe-hud__bracket--br" />
        <div className="globe-hud__scanline" />
      </div>

      <header className="globe-hud__header">
        <div className="globe-hud__title">
          <span className="globe-hud__dot" /> CONCIERGE · GLOBE LINK
        </div>
        <div className="globe-hud__meta">
          {listening && <span className="globe-hud__rec">● REC</span>}
          {speaking && <span className="globe-hud__tx">▮▮ TX</span>}
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="globe-hud__btn"
            aria-label={collapsed ? 'Expand globe' : 'Collapse globe'}
          >
            {collapsed ? '⤢' : '⤡'}
          </button>
        </div>
      </header>

      <div ref={wrapperRef} className="globe-hud__canvas">
        {/* Globe waits for the token read (see useGlobeTokens) — every
            colour prop below needs a literal string, not a CSS var(). */}
        {!collapsed && tokens && (
          <Globe
            // @ts-expect-error react-globe.gl ref typings are loose
            ref={globeRef}
            width={size.w}
            height={size.h}
            backgroundColor="rgba(0,0,0,0)"
            showAtmosphere
            atmosphereColor={tokens.accent}
            atmosphereAltitude={0.22}
            // Dark globe surface — solid color, no texture, so the hex points
            // and arcs read as the dominant visual.
            globeMaterial={undefined}
            globeImageUrl={undefined}
            showGlobe
            // Hex polygons for the landmasses — gives that point-cloud look.
            hexPolygonsData={landFeatures}
            hexPolygonResolution={3}
            hexPolygonMargin={0.4}
            hexPolygonUseDots
            hexPolygonColor={() => `rgba(${tokens.accentRgb}, 0.78)`}
            // Arcs (origin → destination)
            arcsData={arcsData}
            arcColor="color"
            arcAltitudeAutoScale={0.45}
            arcStroke={0.45}
            arcDashLength={0.4}
            arcDashGap={0.15}
            arcDashAnimateTime={2200}
            arcLabel="label"
            // Points (highlighted cities)
            pointsData={pointsData}
            pointAltitude={0.04}
            pointColor="color"
            pointRadius="size"
            pointLabel="label"
            // Pulse ring on focus change
            ringsData={ringsData}
            ringColor={() => (t: number) => `rgba(${tokens.amberRgb},${1 - t})`}
            ringMaxRadius={6}
            ringPropagationSpeed={3}
            ringRepeatPeriod={800}
          />
        )}
      </div>

      <div className="globe-hud__readouts">
        {readouts.map(r => (
          <div key={r.id} className="globe-hud__readout">
            <div className="globe-hud__readout-label">{r.label}</div>
            <div className="globe-hud__readout-value">
              {r.value}
              {r.unit && <span className="globe-hud__readout-unit">{r.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      <footer className="globe-hud__status">
        <span className="globe-hud__status-text">{statusLine}</span>
      </footer>
    </aside>
  );
}

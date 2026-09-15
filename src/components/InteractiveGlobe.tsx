'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { airportByCode } from '@/lib/airports';

// react-globe.gl uses three.js + WebGL — must be loaded client-side only.
const Globe = dynamic(() => import('react-globe.gl').then(m => m.default), { ssr: false });

type DealLite = {
  origin: string;
  destination: string;
  price: number;
  depart_date: string;
};

// Subset of airport coords for the globe. Pulled from /lib/airports.ts at
// runtime (one lookup per code) but cached here so we don't iterate per
// frame.
function coords(iata: string): { lat: number; lng: number } | null {
  const a = airportByCode(iata);
  if (!a) return null;
  // The airports.ts dataset doesn't ship lat/lng for size reasons. Fall back
  // to a curated map of major airports — keep this list aligned with the
  // hubs we actually surface on the globe.
  const COORDS: Record<string, [number, number]> = {
    JFK: [40.6413, -73.7781], EWR: [40.6925, -74.1687], LGA: [40.7769, -73.8740],
    LAX: [33.9416, -118.4085], SFO: [37.6213, -122.3790], ORD: [41.9742, -87.9073],
    DFW: [32.8998, -97.0403], MIA: [25.7959, -80.2870], ATL: [33.6407, -84.4277],
    BOS: [42.3656, -71.0096], IAD: [38.9531, -77.4565], SEA: [47.4502, -122.3088],
    LHR: [51.4700, -0.4543], CDG: [49.0097, 2.5479], AMS: [52.3105, 4.7683],
    FRA: [50.0379, 8.5622], MAD: [40.4719, -3.5626], BCN: [41.2974, 2.0833],
    FCO: [41.8003, 12.2389], MXP: [45.6306, 8.7281], LIS: [38.7813, -9.1359],
    ATH: [37.9364, 23.9445], IST: [41.2753, 28.7519], DXB: [25.2532, 55.3657],
    DOH: [25.2731, 51.6080], AUH: [24.4330, 54.6511], TLV: [32.0114, 34.8867],
    CAI: [30.1219, 31.4056], JNB: [-26.1392, 28.2460], CMN: [33.3675, -7.5898],
    NRT: [35.7720, 140.3929], HND: [35.5494, 139.7798], ICN: [37.4602, 126.4407],
    PEK: [40.0801, 116.5846], PVG: [31.1443, 121.8083], HKG: [22.3080, 113.9185],
    BKK: [13.6900, 100.7501], SIN: [1.3644, 103.9915], DEL: [28.5562, 77.1000],
    BOM: [19.0896, 72.8656], SYD: [-33.9399, 151.1753], MEL: [-37.6733, 144.8430],
    AKL: [-37.0082, 174.7850], GRU: [-23.4356, -46.4731], EZE: [-34.8222, -58.5358],
    SCL: [-33.3930, -70.7858], LIM: [-12.0219, -77.1143], BOG: [4.7016, -74.1469],
    MEX: [19.4361, -99.0719], CUN: [21.0365, -86.8771], YYZ: [43.6777, -79.6248],
    YVR: [49.1939, -123.1844],
  };
  const c = COORDS[a.iata];
  return c ? { lat: c[0], lng: c[1] } : null;
}

type Point = {
  lat: number; lng: number;
  iata: string; size: number; color: string;
  city: string; country: string;
};
type Arc = {
  startLat: number; startLng: number;
  endLat: number; endLng: number;
  color: string; price: number;
  origin: string; destination: string;
  departDate: string;
};

export function InteractiveGlobe({
  deals,
  height = 520,
}: {
  deals: DealLite[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 600, h: height });
  const [selected, setSelected] = useState<Arc | null>(null);
  const [progress, setProgress] = useState(0); // 0..1 along selected arc

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setSize({ w: Math.floor(width), h: height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [height]);

  const { points, arcs } = useMemo(() => {
    const pointMap = new Map<string, Point>();
    const arcArr: Arc[] = [];
    for (const d of deals) {
      const a = coords(d.origin);
      const b = coords(d.destination);
      if (!a || !b) continue;
      if (!pointMap.has(d.origin)) {
        const ai = airportByCode(d.origin);
        pointMap.set(d.origin, {
          ...a, iata: d.origin, size: 0.4, color: '#fbbf24',
          city: ai?.city ?? d.origin, country: ai?.country ?? '',
        });
      }
      if (!pointMap.has(d.destination)) {
        const bi = airportByCode(d.destination);
        pointMap.set(d.destination, {
          ...b, iata: d.destination, size: 0.5, color: '#22d3ee',
          city: bi?.city ?? d.destination, country: bi?.country ?? '',
        });
      }
      arcArr.push({
        startLat: a.lat, startLng: a.lng,
        endLat: b.lat, endLng: b.lng,
        color: '#60a5fa', price: d.price,
        origin: d.origin, destination: d.destination,
        departDate: d.depart_date,
      });
    }
    return { points: Array.from(pointMap.values()), arcs: arcArr.slice(0, 80) };
  }, [deals]);

  // Animate a flight along the selected arc.
  useEffect(() => {
    if (!selected) return;
    let raf = 0;
    const start = performance.now();
    const duration = 3500;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selected]);

  // Point along great-circle (slerp for unit sphere). MapLibre-style
  // geodesic interpolation — good enough visually.
  function planePos(arc: Arc, t: number) {
    const lat1 = (arc.startLat * Math.PI) / 180;
    const lng1 = (arc.startLng * Math.PI) / 180;
    const lat2 = (arc.endLat * Math.PI) / 180;
    const lng2 = (arc.endLng * Math.PI) / 180;
    const d = 2 * Math.asin(Math.sqrt(
      Math.sin((lat2 - lat1) / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
    ));
    if (d === 0) return { lat: arc.startLat, lng: arc.startLng };
    const A = Math.sin((1 - t) * d) / Math.sin(d);
    const B = Math.sin(t * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI;
    const lng = (Math.atan2(y, x) * 180) / Math.PI;
    return { lat, lng };
  }

  const planePoints = useMemo<Point[]>(() => {
    if (!selected) return [];
    const p = planePos(selected, progress);
    return [{
      ...p, iata: '✈',
      size: 0.6, color: '#fde047',
      city: '', country: '',
    }];
  }, [selected, progress]);

  return (
    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow text-brand-600">Discover worldwide</div>
          <h2 className="!mb-0">Drag to spin · click an arc to fly it</h2>
        </div>
        {selected && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Flying</div>
            <div className="font-mono font-semibold text-sm text-slate-800 dark:text-slate-100">
              {selected.origin} → {selected.destination}
            </div>
            <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold tabular">
              from ${Math.round(selected.price)}/adult
            </div>
          </div>
        )}
      </div>
      <div ref={containerRef} style={{ width: '100%', height }}>
        {size.w > 0 && (
          <Globe
            ref={globeRef}
            width={size.w}
            height={size.h}
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
            bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
            backgroundColor="rgba(0,0,0,0)"
            atmosphereColor="#60a5fa"
            atmosphereAltitude={0.18}
            arcsData={arcs}
            arcStartLat="startLat"
            arcStartLng="startLng"
            arcEndLat="endLat"
            arcEndLng="endLng"
            arcColor={(a: any) => selected && a.origin === selected.origin && a.destination === selected.destination
              ? '#fde047' : a.color}
            arcAltitudeAutoScale={0.4}
            arcDashLength={0.4}
            arcDashGap={0.2}
            arcDashAnimateTime={2000}
            arcStroke={0.4}
            arcLabel={(a: any) => `<div style="font:600 12px sans-serif;color:#fff;background:rgba(0,0,0,0.7);padding:4px 8px;border-radius:6px"><div>${a.origin} → ${a.destination}</div><div style="color:#34d399">$${Math.round(a.price)}/adult</div></div>`}
            onArcClick={(arc: any) => {
              setProgress(0);
              setSelected(arc);
            }}
            pointsData={[...points, ...planePoints]}
            pointLat="lat"
            pointLng="lng"
            pointColor="color"
            pointAltitude={(p: any) => p.iata === '✈' ? 0.04 : 0.01}
            pointRadius="size"
            pointLabel={(p: any) => p.iata === '✈' ? '' : `<div style="font:600 12px sans-serif;color:#fff;background:rgba(0,0,0,0.7);padding:4px 8px;border-radius:6px"><div>${p.iata}</div><div style="font-weight:400;font-size:11px;color:#cbd5e1">${p.city}${p.country ? ', ' + p.country : ''}</div></div>`}
          />
        )}
      </div>
      <div className="px-5 py-3 text-[11px] text-slate-500 border-t border-slate-200/60 dark:border-slate-700">
        {arcs.length} live routes plotted · click any arc to watch a plane fly it · drag to spin · scroll to zoom
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { airportByCode } from '@/lib/airports';
import { BookButton } from '@/components/BookButton';
import { fmtUSD, fmtDate } from '@/lib/utils';

// Coordinates table, kept local to this map.
const COORDS: Record<string, [number, number]> = {
  JFK: [40.6413, -73.7781], EWR: [40.6925, -74.1687], LGA: [40.7769, -73.8740],
  LAX: [33.9416, -118.4085], SFO: [37.6213, -122.3790], ORD: [41.9742, -87.9073],
  DFW: [32.8998, -97.0403], MIA: [25.7959, -80.2870], ATL: [33.6407, -84.4277],
  BOS: [42.3656, -71.0096], IAD: [38.9531, -77.4565], SEA: [47.4502, -122.3088],
  LHR: [51.4700, -0.4543], CDG: [49.0097, 2.5479], AMS: [52.3105, 4.7683],
  FRA: [50.0379, 8.5622], MAD: [40.4719, -3.5626], BCN: [41.2974, 2.0833],
  FCO: [41.8003, 12.2389], LIS: [38.7813, -9.1359], ATH: [37.9364, 23.9445],
  IST: [41.2753, 28.7519], DXB: [25.2532, 55.3657], DOH: [25.2731, 51.6080],
  TLV: [32.0114, 34.8867], CAI: [30.1219, 31.4056], JNB: [-26.1392, 28.2460],
  CMN: [33.3675, -7.5898], NRT: [35.7720, 140.3929], ICN: [37.4602, 126.4407],
  HKG: [22.3080, 113.9185], BKK: [13.6900, 100.7501], SIN: [1.3644, 103.9915],
  DEL: [28.5562, 77.1000], BOM: [19.0896, 72.8656], SYD: [-33.9399, 151.1753],
  MEL: [-37.6733, 144.8430], GRU: [-23.4356, -46.4731], MEX: [19.4361, -99.0719],
  CUN: [21.0365, -86.8771], YYZ: [43.6777, -79.6248], YVR: [49.1939, -123.1844],
  ORL: [28.4312, -81.3081], JAX: [30.4941, -81.6879],
  // City metaroutes — Travelpayouts/Aviasales return these in deals (NYC, LON,
  // PAR…) instead of specific airports. Map them to the metro-area centroid.
  NYC: [40.7128, -74.0060], LON: [51.5074, -0.1278], PAR: [48.8566, 2.3522],
  ROM: [41.9028, 12.4964], TYO: [35.6762, 139.6503], CHI: [41.8781, -87.6298],
  WAS: [38.9072, -77.0369], MOW: [55.7558, 37.6173], BJS: [39.9042, 116.4074],
};

// City metaroute → list of constituent airport IATA codes. Used so that
// clicking "JFK" in the map tab still matches deals whose origin came back
// as "NYC" (the Travelpayouts data API normalizes some origins to city codes).
const CITY_TO_AIRPORTS: Record<string, string[]> = {
  NYC: ['JFK', 'EWR', 'LGA'],
  LON: ['LHR', 'LGW', 'STN', 'LCY', 'LTN'],
  PAR: ['CDG', 'ORY'],
  ROM: ['FCO', 'CIA'],
  TYO: ['NRT', 'HND'],
  CHI: ['ORD', 'MDW'],
  WAS: ['IAD', 'DCA', 'BWI'],
  MOW: ['SVO', 'DME', 'VKO'],
};
const AIRPORT_TO_CITY: Record<string, string> = (() => {
  const r: Record<string, string> = {};
  for (const [city, list] of Object.entries(CITY_TO_AIRPORTS)) {
    for (const a of list) r[a] = city;
  }
  return r;
})();

function coords(iata: string): [number, number] | null {
  return COORDS[iata.toUpperCase()] ?? null;
}

/**
 * True if a deal's origin string belongs to the user-selected origin. Handles
 * the city-vs-airport mismatch: if the user selected JFK and the deal's
 * origin is "NYC", that still counts as a match (NYC is the metro that
 * contains JFK). Symmetric — picking "NYC" matches deals from JFK/EWR/LGA.
 */
function originMatches(dealOrigin: string, selected: string): boolean {
  const a = dealOrigin.toUpperCase();
  const b = selected.toUpperCase();
  if (a === b) return true;
  // Selected is a city, deal is an airport in that city.
  if (CITY_TO_AIRPORTS[b]?.includes(a)) return true;
  // Selected is an airport, deal is the city covering it.
  if (CITY_TO_AIRPORTS[a]?.includes(b)) return true;
  // Both are airports but share a city.
  if (AIRPORT_TO_CITY[a] && AIRPORT_TO_CITY[a] === AIRPORT_TO_CITY[b]) return true;
  return false;
}

// Great-circle interpolation → array of [lng, lat] points for a smooth arc.
function greatCircle(
  from: [number, number], // [lat, lng]
  to: [number, number],
  steps = 64,
): Array<[number, number]> {
  const lat1 = (from[0] * Math.PI) / 180;
  const lng1 = (from[1] * Math.PI) / 180;
  const lat2 = (to[0] * Math.PI) / 180;
  const lng2 = (to[1] * Math.PI) / 180;
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
  ));
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (d === 0) { out.push([from[1], from[0]]); continue; }
    const A = Math.sin((1 - t) * d) / Math.sin(d);
    const B = Math.sin(t * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.cos(lng2) * 0 + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI;
    const lng = (Math.atan2(y, x) * 180) / Math.PI;
    out.push([lng, lat]);
  }
  return out;
}

type DealLite = {
  origin: string;
  destination: string;
  price: number;
  depart_date: string;
  return_date?: string | null;
};

export function SatelliteExploreMap({
  deals,
  defaultOrigin = 'JFK',
  height = 520,
}: {
  deals: DealLite[];
  defaultOrigin?: string;
  height?: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<string>(defaultOrigin);
  const [ready, setReady] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<DealLite | null>(null);

  const allOrigins = Array.from(new Set(deals.map(d => d.origin))).filter(c => coords(c));
  const origins = allOrigins.length > 0 ? allOrigins : ['JFK', 'EWR', 'LAX', 'LHR', 'CDG'];

  // Closure-stable refs for the click handler — we register it once at map
  // load, but `deals` and `selectedOrigin` change over the component's life.
  const dealsRef = useRef(deals);
  const originRef = useRef(selectedOrigin);
  useEffect(() => { dealsRef.current = deals; }, [deals]);
  useEffect(() => { originRef.current = selectedOrigin; }, [selectedOrigin]);

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !mapRef.current) return;
      const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
      // Esri WorldImagery — token-free satellite raster tiles. Used as a
      // fallback if MAPTILER_KEY is absent so the user still gets a real
      // satellite map instead of demotiles' flat blue ocean.
      const esriFallbackStyle: any = {
        version: 8,
        sources: {
          esri: {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
          },
        },
        layers: [{ id: 'esri-tiles', type: 'raster', source: 'esri' }],
      };
      const style: any = key
        ? `https://api.maptiler.com/maps/satellite/style.json?key=${key}`
        : esriFallbackStyle;
      const map = new maplibregl.Map({
        container: mapRef.current,
        style,
        center: [0, 20],
        zoom: 1.6,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      map.on('load', () => {
        // Same runtime-token rule as the route/marker effect below — resolved
        // once here since this layer is created before any deal data exists.
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        map.addSource('routes', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        if (accent) {
          map.addLayer({
            id: 'routes-line',
            type: 'line',
            source: 'routes',
            paint: {
              'line-color': accent,
              'line-width': 1.4,
              'line-opacity': 0.85,
              'line-blur': 0.5,
            },
          });
        }
        setReady(true);
      });
      mapInst.current = map;
    })();
    return () => { cancelled = true; mapInst.current?.remove(); mapInst.current = null; };
  }, []);

  // Re-render routes whenever selectedOrigin or deals change.
  useEffect(() => {
    const map = mapInst.current;
    if (!map || !ready) return;
    const origin = selectedOrigin;
    const from = coords(origin);
    if (!from) return;

    // Colours come from the token cascade at runtime (RouteField.tsx's
    // pattern) — maplibre paint properties are resolved once when set, so a
    // CSS custom property string can't be handed to them directly. If the
    // layer is empty, draw nothing rather than fall back to a hardcoded hex.
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim();
    const amber = css.getPropertyValue('--amber').trim();
    const panelFg = css.getPropertyValue('--panel-fg').trim();
    const panelBg = css.getPropertyValue('--panel-bg').trim();
    if (!accent || !amber || !panelFg || !panelBg) return;

    // Build geojson: one LineString per destination from this origin.
    const routeFeatures: any[] = [];
    const destPointFeatures: any[] = [];
    const dests = new Set<string>();
    for (const d of deals) {
      // City-vs-airport-aware match so NYC-origin deals show under any of
      // JFK/EWR/LGA tabs (and vice versa).
      if (!originMatches(d.origin, origin)) continue;
      const to = coords(d.destination);
      if (!to) continue;
      const line = greatCircle(from, to);
      routeFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: line },
        properties: { destination: d.destination, price: d.price },
      });
      if (!dests.has(d.destination)) {
        dests.add(d.destination);
        destPointFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [to[1], to[0]] },
          properties: { iata: d.destination, price: Math.round(d.price) },
        });
      }
    }
    const src = map.getSource('routes') as any;
    if (src) src.setData({ type: 'FeatureCollection', features: routeFeatures });

    // Origin + destination markers.
    // Clear prior layers we add by name.
    for (const layerId of ['origin-marker', 'dest-marker', 'dest-label']) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    for (const sourceId of ['origin-src', 'dest-src']) {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    }
    map.addSource('origin-src', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'Point', coordinates: [from[1], from[0]] }, properties: { iata: origin } },
    });
    map.addLayer({
      id: 'origin-marker',
      type: 'circle',
      source: 'origin-src',
      // Round is one of the sanctioned radius exceptions (chart/map-marker
      // geometry) — the colour still comes from the token cascade.
      paint: { 'circle-radius': 7, 'circle-color': accent, 'circle-stroke-color': panelFg, 'circle-stroke-width': 2 },
    });
    map.addSource('dest-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: destPointFeatures },
    });
    map.addLayer({
      id: 'dest-marker',
      type: 'circle',
      source: 'dest-src',
      // Destinations carry a fare (the label below prints its price) — amber.
      paint: { 'circle-radius': 5, 'circle-color': amber, 'circle-stroke-color': panelFg, 'circle-stroke-width': 1.5 },
    });
    map.on('mouseenter', 'dest-marker', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'dest-marker', () => { map.getCanvas().style.cursor = ''; });
    map.on('click', 'dest-marker', (e: any) => {
      const f = e.features?.[0];
      if (!f) return;
      const iata: string = f.properties?.iata;
      const found = dealsRef.current.find(d => d.destination === iata && originMatches(d.origin, originRef.current));
      if (found) setSelectedDeal(found);
    });
    map.addLayer({
      id: 'dest-label',
      type: 'symbol',
      source: 'dest-src',
      layout: {
        'text-field': ['concat', ['get', 'iata'], '  $', ['get', 'price']],
        'text-size': 11,
        'text-offset': [0, -1.4],
        'text-anchor': 'bottom',
        'text-font': ['Noto Sans Regular'],
      },
      paint: {
        'text-color': panelFg,
        'text-halo-color': panelBg,
        'text-halo-width': 1.4,
      },
    });
  }, [selectedOrigin, deals, ready]);

  return (
    <div style={{ border: '1px solid var(--rule)' }}>
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="ed-eyebrow">Explore by map · satellite</div>
          <h2 className="ed-h2" style={{ marginTop: 6 }}>Pick an origin · see every route we&rsquo;ve seen</h2>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {origins.slice(0, 8).map(o => {
            const a = airportByCode(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => setSelectedOrigin(o)}
                className={`ed-chip${selectedOrigin === o ? ' active' : ''}`}
                style={{ fontFamily: 'var(--font-mono-ed)' }}
                title={a ? `${a.city}, ${a.country}` : o}
              >
                {o}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ position: 'relative', width: '100%', height }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {selectedDeal && (
          <div
            className="absolute z-10"
            style={{
              right: 16, bottom: 16,
              maxWidth: 320,
              background: 'var(--panel-bg)',
              color: 'var(--panel-fg)',
              border: '1px solid color-mix(in srgb, var(--panel-fg) 20%, var(--panel-bg))',
              padding: '14px 16px',
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="ed-mono" style={{ color: 'color-mix(in srgb, var(--panel-fg) 72%, var(--panel-bg))' }}>
                  {selectedDeal.origin} → {selectedDeal.destination}
                </div>
                <div className="font-display font-bold text-base mt-0.5">
                  {airportByCode(selectedDeal.destination)?.city ?? selectedDeal.destination}
                </div>
              </div>
              <button
                onClick={() => setSelectedDeal(null)}
                aria-label="Close"
                className="text-xs"
                style={{ color: 'color-mix(in srgb, var(--panel-fg) 72%, var(--panel-bg))', lineHeight: 1, padding: 4 }}
              >✕</button>
            </div>
            <div className="flex items-baseline gap-1.5 mb-2">
              <span className="text-2xl font-bold tabular" style={{ color: 'var(--amber)' }}>{fmtUSD(selectedDeal.price)}</span>
              <span className="text-xs" style={{ color: 'color-mix(in srgb, var(--panel-fg) 72%, var(--panel-bg))' }}>per adult</span>
            </div>
            <div className="text-[11px] mb-3" style={{ color: 'color-mix(in srgb, var(--panel-fg) 72%, var(--panel-bg))' }}>
              {fmtDate(selectedDeal.depart_date.slice(0, 10))}
              {selectedDeal.return_date && ` → ${fmtDate(selectedDeal.return_date.slice(0, 10))}`}
            </div>
            <BookButton
              origin={selectedDeal.origin}
              destination={selectedDeal.destination}
              departDate={selectedDeal.depart_date.slice(0, 10)}
              returnDate={(selectedDeal.return_date ?? selectedDeal.depart_date).slice(0, 10) ||
                new Date(new Date(selectedDeal.depart_date).getTime() + 7 * 86400000).toISOString().slice(0, 10)}
              adults={1}
              infants={0}
              size="sm"
              perAdultUsd={selectedDeal.price}
              surface="explore-map-panel"
            />
          </div>
        )}
      </div>
      <div className="px-5 py-3" style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--rule)' }}>
        {ready ? '' : 'Loading satellite tiles… '}
        Click any destination marker to see price + book direct.
      </div>
    </div>
  );
}

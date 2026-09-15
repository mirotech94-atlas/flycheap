/**
 * Shared MapLibre tile-style helpers.
 *
 * Extracted from SatelliteExploreMap.tsx so /hotels' new split-view map can
 * reuse the same MAPTILER_KEY → Esri WorldImagery fallback pattern.
 *
 * Usage:
 *
 *   import maplibregl from 'maplibre-gl';
 *   import { satelliteStyle, streetStyle } from '@/lib/mapTiles';
 *
 *   const map = new maplibregl.Map({
 *     container,
 *     style: streetStyle(),
 *     center: [lng, lat],
 *     zoom: 12,
 *   });
 *
 * Why a function (not a constant)?
 *   The MAPTILER_KEY env var is only read inside the function so that swapping
 *   the env variable on a long-running prod process is picked up on the next
 *   page navigation rather than baked in at module-load.
 */

export type MapStyle = string | Record<string, unknown>;

const ESRI_SATELLITE_STYLE: Record<string, unknown> = {
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

const OSM_STREET_STYLE: Record<string, unknown> = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm' }],
};

/** Satellite raster tiles: MAPTILER if NEXT_PUBLIC_MAPTILER_KEY is set, else Esri WorldImagery. */
export function satelliteStyle(): MapStyle {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  return key
    ? `https://api.maptiler.com/maps/satellite/style.json?key=${key}`
    : ESRI_SATELLITE_STYLE;
}

/** Street/standard map: MAPTILER streets if key present, else OSM raster tiles. */
export function streetStyle(): MapStyle {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  return key
    ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`
    : OSM_STREET_STYLE;
}

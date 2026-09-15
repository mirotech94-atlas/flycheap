'use client';

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { streetStyle } from '@/lib/mapTiles';
import type { Hotel } from '@/lib/hotelMockData';
import { HOTEL_CITY_CENTERS } from '@/lib/hotelMockData';

/**
 * Interactive MapLibre map for the /hotels split view.
 *
 * - One marker per visible hotel (filtered list passed in from parent).
 * - Marker click → notifies parent which highlights / scrolls the card.
 * - hoveredHotelId from the card list enlarges the corresponding marker.
 * - Uses streetStyle() from mapTiles.ts (MAPTILER if NEXT_PUBLIC_MAPTILER_KEY,
 *   otherwise OSM raster fallback).
 */
export function HotelsMap({
  destination,
  hotels,
  selectedId,
  hoveredId,
  onMarkerClick,
  height = 600,
}: {
  destination: string;
  hotels: Hotel[];
  selectedId: string | null;
  hoveredId: string | null;
  onMarkerClick: (hotelId: string) => void;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const popupRef = useRef<any>(null);
  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => { onMarkerClickRef.current = onMarkerClick; }, [onMarkerClick]);

  // Initialize map once.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current) return;
      const center = HOTEL_CITY_CENTERS[destination.toUpperCase()];
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: streetStyle() as any,
        center: center ? [center.lng, center.lat] : [0, 20],
        zoom: center ? 12 : 2,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center when destination changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const center = HOTEL_CITY_CENTERS[destination.toUpperCase()];
    if (center) map.flyTo({ center: [center.lng, center.lat], zoom: 12, duration: 800 });
  }, [destination]);

  // Re-render markers when the visible hotel set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let alive = true;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (!alive) return;
      // Drop existing markers.
      for (const m of markersRef.current.values()) m.remove();
      markersRef.current.clear();

      for (const h of hotels) {
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('data-hotel-id', h.id);
        el.style.cssText = [
          'background: #0ea5e9',
          'color: white',
          'font: 600 11px/1 system-ui, sans-serif',
          'padding: 4px 7px',
          'border-radius: 999px',
          'border: 2px solid white',
          'box-shadow: 0 1px 4px rgba(0,0,0,0.25)',
          'cursor: pointer',
          'transform-origin: center',
          'transition: transform 120ms ease',
        ].join(';');
        el.textContent = `$${h.price}`;
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onMarkerClickRef.current(h.id);
          // Show popover next to marker.
          if (popupRef.current) popupRef.current.remove();
          popupRef.current = new maplibregl.Popup({ offset: 14, closeButton: true, closeOnClick: false })
            .setLngLat([h.lng, h.lat])
            .setHTML(`
              <div style="font: 12px system-ui; min-width: 180px;">
                <div style="font-weight:600; margin-bottom:2px;">${escapeHtml(h.name)}</div>
                <div style="color:#64748b; font-size:11px;">${h.stars}★ · ${h.area}</div>
                <div style="margin-top:4px;">
                  <span style="font-weight:700; color:#0ea5e9;">$${h.price}</span>
                  <span style="color:#64748b;">/night</span>
                  · <span style="color:#f59e0b;">⭐ ${h.rating}</span>
                </div>
              </div>
            `)
            .addTo(map);
        });
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([h.lng, h.lat])
          .addTo(map);
        markersRef.current.set(h.id, marker);
      }
    })();
    return () => { alive = false; };
  }, [hotels]);

  // Highlight selected / hovered markers.
  useEffect(() => {
    for (const [id, marker] of markersRef.current.entries()) {
      const el: HTMLElement = marker.getElement();
      const isSel = id === selectedId;
      const isHover = id === hoveredId;
      el.style.transform = isSel || isHover ? 'scale(1.4)' : 'scale(1)';
      el.style.background = isSel ? '#f59e0b' : isHover ? '#0284c7' : '#0ea5e9';
      el.style.zIndex = isSel ? '20' : isHover ? '10' : '1';
    }
  }, [selectedId, hoveredId]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%', borderRadius: 12, overflow: 'hidden' }}
      className="border"
    />
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

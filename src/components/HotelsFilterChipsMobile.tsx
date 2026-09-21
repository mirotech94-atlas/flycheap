'use client';

import { useState } from 'react';
import { ALL_AMENITIES, type HotelAmenity } from '@/lib/hotelMockData';
import type { FilterState } from './HotelsFilterRail';

/**
 * Mobile-only horizontal chip row for the hotels filter rail.
 *
 * Visible at < lg breakpoint only (HotelsBoard wraps it in `lg:hidden`).
 * Each chip summarises one filter category. Tapping a chip opens a fixed-
 * position bottom sheet (modal with backdrop blur) containing the full
 * controls for that category. Same URL params as the desktop rail — the
 * parent owns FilterState, so persistence is automatic.
 *
 * Active filters use `.ed-chip.active` (the `--btn-bg`/`--btn-fg` pair every
 * other active chip in the app uses — amber stays reserved for fares/deltas,
 * not filter state). Inactive chips are the plain `.ed-chip`. A "Clear all"
 * chip appears on the right whenever any filter is set.
 *
 * Tailwind for layout only — colour/radius/shadow come from editorial.css.
 */
type Category = 'price' | 'stars' | 'amenities' | 'distance';

function priceLabel(state: FilterState, bounds: { min: number; max: number }): string | null {
  if (state.priceMin > bounds.min || state.priceMax < bounds.max) {
    return `Price · $${state.priceMin}–$${state.priceMax >= bounds.max ? `${bounds.max}+` : state.priceMax}`;
  }
  return null;
}
function starsLabel(state: FilterState): string | null {
  if (state.stars.size === 0) return null;
  return `${Array.from(state.stars).sort().map(s => `${s}★`).join(' ')}`;
}
function amenitiesLabel(state: FilterState): string | null {
  if (state.amenities.size === 0) return null;
  const names = ALL_AMENITIES.filter(a => state.amenities.has(a.id)).map(a => a.label);
  if (names.length <= 2) return names.join(' + ');
  return `${names.slice(0, 2).join(' + ')} +${names.length - 2}`;
}
function distanceLabel(state: FilterState): string | null {
  if (state.maxDistanceKm >= 25) return null;
  return `Within ${state.maxDistanceKm} km`;
}

export function HotelsFilterChipsMobile({
  state,
  onChange,
  bounds,
  onReset,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  bounds: { min: number; max: number };
  onReset: () => void;
}) {
  const [open, setOpen] = useState<Category | null>(null);

  const snap = (v: number) => Math.max(25, Math.round(v / 25) * 25);
  const toggleStar = (s: number) => {
    const next = new Set(state.stars);
    if (next.has(s)) next.delete(s); else next.add(s);
    onChange({ ...state, stars: next });
  };
  const toggleAmenity = (a: HotelAmenity) => {
    const next = new Set(state.amenities);
    if (next.has(a)) next.delete(a); else next.add(a);
    onChange({ ...state, amenities: next });
  };

  const chips: Array<{ id: Category; defaultLabel: string; activeLabel: string | null }> = [
    { id: 'price',     defaultLabel: 'Price',     activeLabel: priceLabel(state, bounds) },
    { id: 'stars',     defaultLabel: 'Stars',     activeLabel: starsLabel(state) },
    { id: 'amenities', defaultLabel: 'Amenities', activeLabel: amenitiesLabel(state) },
    { id: 'distance',  defaultLabel: 'Distance',  activeLabel: distanceLabel(state) },
  ];
  const anyActive = chips.some(c => c.activeLabel !== null);

  return (
    <>
      {/* Horizontally-scrollable strip. lg:hidden hides on desktop. */}
      <div
        className="lg:hidden -mx-2 px-2 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="flex items-center gap-1.5 py-1 w-max">
          {chips.map(chip => {
            const active = chip.activeLabel !== null;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setOpen(chip.id)}
                className={`ed-chip shrink-0 whitespace-nowrap${active ? ' active' : ''}`}
              >
                {active ? chip.activeLabel : chip.defaultLabel}
              </button>
            );
          })}
          {anyActive && (
            <button
              type="button"
              onClick={onReset}
              className="ed-chip shrink-0 whitespace-nowrap"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Bottom sheet — fixed position, backdrop blur, slide up. */}
      {open !== null && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(null)}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'color-mix(in srgb, var(--panel-bg) 55%, transparent)', backdropFilter: 'blur(6px)' }}
          />
          <div
            className="ed-panel relative w-full max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>
                {open === 'price' && 'Price per night'}
                {open === 'stars' && 'Star rating'}
                {open === 'amenities' && 'Amenities'}
                {open === 'distance' && 'Distance from center'}
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                style={{ fontSize: 12, textDecoration: 'underline', color: 'var(--muted)' }}
              >
                Done
              </button>
            </div>

            {open === 'price' && (
              <div className="space-y-3">
                <div className="tabular-nums" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  ${state.priceMin} – ${state.priceMax >= bounds.max ? `${bounds.max}+` : state.priceMax}
                </div>
                <label className="block" style={{ fontSize: 10, color: 'var(--muted-2)' }}>Min</label>
                <input
                  type="range"
                  min={bounds.min}
                  max={bounds.max}
                  step={25}
                  value={state.priceMin}
                  onChange={(e) => {
                    const v = snap(Number(e.target.value));
                    onChange({ ...state, priceMin: Math.min(v, state.priceMax - 25) });
                  }}
                  className="w-full"
                />
                <label className="block" style={{ fontSize: 10, color: 'var(--muted-2)' }}>Max</label>
                <input
                  type="range"
                  min={bounds.min}
                  max={bounds.max}
                  step={25}
                  value={state.priceMax}
                  onChange={(e) => {
                    const v = snap(Number(e.target.value));
                    onChange({ ...state, priceMax: Math.max(v, state.priceMin + 25) });
                  }}
                  className="w-full"
                />
              </div>
            )}

            {open === 'stars' && (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map(s => {
                  const active = state.stars.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleStar(s)}
                      className={`ed-chip${active ? ' active' : ''}`}
                    >
                      {s}★
                    </button>
                  );
                })}
              </div>
            )}

            {open === 'amenities' && (
              <div className="grid grid-cols-2 gap-2">
                {ALL_AMENITIES.map(a => {
                  const active = state.amenities.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAmenity(a.id)}
                      className={`ed-chip${active ? ' active' : ''}`}
                      style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            )}

            {open === 'distance' && (
              <div className="space-y-3">
                <div className="tabular-nums" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  ≤ {state.maxDistanceKm} km from center
                </div>
                <input
                  type="range"
                  min={0}
                  max={25}
                  step={1}
                  value={state.maxDistanceKm}
                  onChange={(e) => onChange({ ...state, maxDistanceKm: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

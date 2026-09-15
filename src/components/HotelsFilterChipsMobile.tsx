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
 * Active filters get a gold pill background (matches the existing
 * `ring-amber-400` accent used elsewhere). Inactive chips are neutral
 * tokens (--bg-elevated + --border). A "Clear all" chip appears on the
 * right whenever any filter is set.
 *
 * Pure Tailwind — no headlessui / radix dep.
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
                className="shrink-0 px-3 py-1.5 rounded-full text-[11px] border transition-colors whitespace-nowrap"
                style={{
                  background: active ? 'rgba(245,158,11,0.18)' : 'var(--bg-elevated)',
                  color: 'var(--text)',
                  borderColor: active ? '#f59e0b' : 'var(--border, rgba(148,163,184,0.4))',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {active ? chip.activeLabel : chip.defaultLabel}
              </button>
            );
          })}
          {anyActive && (
            <button
              type="button"
              onClick={onReset}
              className="shrink-0 px-3 py-1.5 rounded-full text-[11px] border transition-colors whitespace-nowrap"
              style={{
                background: 'transparent',
                color: 'var(--text-muted, #64748b)',
                borderColor: 'var(--border, rgba(148,163,184,0.4))',
              }}
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
            style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }}
          />
          <div
            className="relative w-full rounded-t-2xl p-5 max-h-[75vh] overflow-y-auto"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm">
                {open === 'price' && 'Price per night'}
                {open === 'stars' && 'Star rating'}
                {open === 'amenities' && 'Amenities'}
                {open === 'distance' && 'Distance from center'}
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="text-xs underline decoration-dotted"
                style={{ color: 'var(--text-muted, #64748b)' }}
              >
                Done
              </button>
            </div>

            {open === 'price' && (
              <div className="space-y-3">
                <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted, #64748b)' }}>
                  ${state.priceMin} – ${state.priceMax >= bounds.max ? `${bounds.max}+` : state.priceMax}
                </div>
                <label className="block text-[10px]" style={{ color: 'var(--text-muted, #94a3b8)' }}>Min</label>
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
                <label className="block text-[10px]" style={{ color: 'var(--text-muted, #94a3b8)' }}>Max</label>
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
                      className="px-3 py-1.5 rounded-full text-xs border transition-colors"
                      style={{
                        background: active ? 'rgba(245,158,11,0.18)' : 'transparent',
                        color: 'var(--text)',
                        borderColor: active ? '#f59e0b' : 'var(--border, rgba(148,163,184,0.4))',
                        fontWeight: active ? 600 : 400,
                      }}
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
                      className="px-3 py-2 rounded-lg text-xs border text-left transition-colors"
                      style={{
                        background: active ? 'rgba(245,158,11,0.18)' : 'transparent',
                        color: 'var(--text)',
                        borderColor: active ? '#f59e0b' : 'var(--border, rgba(148,163,184,0.4))',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            )}

            {open === 'distance' && (
              <div className="space-y-3">
                <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted, #64748b)' }}>
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

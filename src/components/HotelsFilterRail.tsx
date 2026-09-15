'use client';

import { useId } from 'react';
import { ALL_AMENITIES, type HotelAmenity } from '@/lib/hotelMockData';

export type FilterState = {
  priceMin: number;
  priceMax: number;
  stars: Set<number>;
  amenities: Set<HotelAmenity>;
  maxDistanceKm: number;
};

export function defaultFilterState(bounds: { min: number; max: number }): FilterState {
  return {
    priceMin: bounds.min,
    priceMax: bounds.max,
    stars: new Set<number>(),
    amenities: new Set<HotelAmenity>(),
    maxDistanceKm: 25,
  };
}

export function HotelsFilterRail({
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
  const minId = useId();
  const maxId = useId();

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

  // Snap to $25 step on slider input.
  const snap = (v: number) => Math.max(25, Math.round(v / 25) * 25);

  return (
    <aside
      className="rounded-xl border p-4 space-y-5"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border, rgba(148,163,184,0.25))', color: 'var(--text)' }}
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Filters</div>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] underline decoration-dotted"
          style={{ color: 'var(--text-muted, #64748b)' }}
        >
          Reset
        </button>
      </div>

      {/* Price range */}
      <div>
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--text)' }}>
          Price per night
        </div>
        <div className="text-[11px] tabular-nums mb-2" style={{ color: 'var(--text-muted, #64748b)' }}>
          ${state.priceMin} – ${state.priceMax >= bounds.max ? `${bounds.max}+` : state.priceMax}
        </div>
        <div className="space-y-1">
          <label htmlFor={minId} className="block text-[10px]" style={{ color: 'var(--text-muted, #94a3b8)' }}>Min</label>
          <input
            id={minId}
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
          <label htmlFor={maxId} className="block text-[10px]" style={{ color: 'var(--text-muted, #94a3b8)' }}>Max</label>
          <input
            id={maxId}
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
      </div>

      {/* Stars */}
      <div>
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--text)' }}>Star rating</div>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map(s => {
            const active = state.stars.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStar(s)}
                className="px-2 py-1 rounded-full text-[11px] border transition-colors"
                style={{
                  background: active ? 'var(--accent, #0ea5e9)' : 'transparent',
                  color: active ? 'white' : 'var(--text)',
                  borderColor: active ? 'var(--accent, #0ea5e9)' : 'var(--border, rgba(148,163,184,0.4))',
                }}
              >
                {s}★
              </button>
            );
          })}
        </div>
      </div>

      {/* Amenities */}
      <div>
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--text)' }}>Amenities</div>
        <div className="flex flex-col gap-1">
          {ALL_AMENITIES.map(a => {
            const active = state.amenities.has(a.id);
            return (
              <label key={a.id} className="flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleAmenity(a.id)}
                  className="rounded"
                />
                <span>{a.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Distance */}
      <div>
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--text)' }}>Distance from center</div>
        <div className="text-[11px] tabular-nums mb-2" style={{ color: 'var(--text-muted, #64748b)' }}>
          ≤ {state.maxDistanceKm} km
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
    </aside>
  );
}

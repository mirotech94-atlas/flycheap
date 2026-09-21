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
    <aside className="ed-panel space-y-5">
      <div className="flex items-center justify-between">
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>Filters</div>
        <button
          type="button"
          onClick={onReset}
          style={{ fontSize: 11, textDecoration: 'underline', color: 'var(--muted)' }}
        >
          Reset
        </button>
      </div>

      {/* Price range */}
      <div>
        <div className="ed-label" style={{ marginBottom: 8 }}>
          Price per night
        </div>
        <div className="tabular-nums" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
          ${state.priceMin} – ${state.priceMax >= bounds.max ? `${bounds.max}+` : state.priceMax}
        </div>
        <div className="space-y-1">
          <label htmlFor={minId} className="block" style={{ fontSize: 10, color: 'var(--muted-2)' }}>Min</label>
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
          <label htmlFor={maxId} className="block" style={{ fontSize: 10, color: 'var(--muted-2)' }}>Max</label>
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
        <div className="ed-label" style={{ marginBottom: 8 }}>Star rating</div>
        <div className="flex flex-wrap gap-1.5">
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
      </div>

      {/* Amenities */}
      <div>
        <div className="ed-label" style={{ marginBottom: 8 }}>Amenities</div>
        <div className="flex flex-col gap-1">
          {ALL_AMENITIES.map(a => {
            const active = state.amenities.has(a.id);
            return (
              <label key={a.id} className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 11, color: 'var(--ink)' }}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleAmenity(a.id)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span>{a.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Distance */}
      <div>
        <div className="ed-label" style={{ marginBottom: 8 }}>Distance from center</div>
        <div className="tabular-nums" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
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

'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { HotelsSearchPanel } from './HotelsSearchPanel';
import { HotelsGrid } from './HotelsGrid';
import { HotelsPriceChart } from './HotelsPriceChart';
import { HotelsMiniGlobe } from './HotelsMiniGlobe';
import { HotelsFilterRail, defaultFilterState, type FilterState } from './HotelsFilterRail';
import { HotelsFilterChipsMobile } from './HotelsFilterChipsMobile';
import { HotelsMap } from './HotelsMap';
import { defaultGuests, encodeGuests, decodeGuests, totalGuests, type GuestsState } from './HotelsGuestsPicker';
import { getHotelsForDestination, priceBounds, type Hotel, type HotelAmenity, ALL_AMENITIES } from '@/lib/hotelMockData';

type SortKey = 'recommended' | 'cheap' | 'deal' | 'rating' | 'distance' | 'reviews';
const SORT_LABELS: Record<SortKey, string> = {
  recommended: 'Recommended',
  cheap: 'Cheapest first',
  deal: 'Best deal',
  rating: 'Highest rating',
  distance: 'Distance from center',
  reviews: 'Most reviews',
};

type ViewMode = 'list' | 'map' | 'split';

const AMENITY_IDS = ALL_AMENITIES.map(a => a.id);

/**
 * Top-level Hotels page board.
 *
 * URL param schema (filters + sort + view + guests, all shareable):
 *   ?destination=SSH
 *   &checkIn=2026-06-01 &checkOut=2026-06-08
 *   &guests=2-0,2-2.4         (2 rooms, room1=2 adults, room2=2 adults+2 children aged 2 and 4)
 *   &price=80-450             (min-max USD/night; "max" only if narrower than data bounds)
 *   &stars=4,5
 *   &amenities=pool,allinclusive
 *   &maxKm=10
 *   &sort=cheap
 *   &view=split
 */
export function HotelsBoard({
  destinationDefault,
  checkInDefault,
  checkOutDefault,
  adultsDefault,
  trackedDestinations,
}: {
  destinationDefault: string;
  checkInDefault: string;
  checkOutDefault: string;
  adultsDefault: number;
  trackedDestinations: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read initial state from URL (so refresh/sharing preserves state).
  const initialDest = (searchParams?.get('destination') ?? destinationDefault).toUpperCase();
  const initialCheckIn = searchParams?.get('checkIn') ?? checkInDefault;
  const initialCheckOut = searchParams?.get('checkOut') ?? checkOutDefault;
  const initialGuests = decodeGuests(searchParams?.get('guests')) ?? defaultGuests(adultsDefault);
  const initialSort = (searchParams?.get('sort') as SortKey) || 'recommended';
  const initialView = (searchParams?.get('view') as ViewMode) || 'list';

  const [destination, setDestination] = useState(initialDest);
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guests, setGuests] = useState<GuestsState>(initialGuests);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [view, setView] = useState<ViewMode>(initialView);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Generate the synthetic hotel set for this destination (stable per code).
  const allHotels = useMemo(() => getHotelsForDestination(destination, 18), [destination]);
  const bounds = useMemo(() => priceBounds(allHotels), [allHotels]);

  // Filter state — initialized from URL or defaults, clamped to current bounds.
  const initialFilter = useMemo<FilterState>(() => {
    const f = defaultFilterState(bounds);
    const priceParam = searchParams?.get('price');
    if (priceParam) {
      const [lo, hi] = priceParam.split('-').map(n => Number(n));
      if (!Number.isNaN(lo)) f.priceMin = Math.max(bounds.min, lo);
      if (!Number.isNaN(hi)) f.priceMax = Math.min(bounds.max, hi);
    }
    const starsParam = searchParams?.get('stars');
    if (starsParam) f.stars = new Set(starsParam.split(',').map(n => Number(n)).filter(n => n >= 1 && n <= 5));
    const amenitiesParam = searchParams?.get('amenities');
    if (amenitiesParam) f.amenities = new Set(amenitiesParam.split(',').filter((a): a is HotelAmenity => (AMENITY_IDS as string[]).includes(a)));
    const maxKmParam = searchParams?.get('maxKm');
    if (maxKmParam) f.maxDistanceKm = Math.max(0, Math.min(25, Number(maxKmParam)));
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.min, bounds.max]);

  const [filter, setFilter] = useState<FilterState>(initialFilter);

  // When the destination changes, re-clamp price bounds.
  useEffect(() => {
    setFilter(prev => ({
      ...prev,
      priceMin: Math.max(bounds.min, Math.min(prev.priceMin, bounds.max - 25)),
      priceMax: Math.min(bounds.max, Math.max(prev.priceMax, bounds.min + 25)),
    }));
    setSelectedId(null);
  }, [bounds.min, bounds.max]);

  // Sync state → URL (debounced for slider noise, replace not push).
  const writeTimer = useRef<number | null>(null);
  useEffect(() => {
    if (writeTimer.current) window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => {
      const qs = new URLSearchParams();
      qs.set('destination', destination);
      if (checkIn) qs.set('checkIn', checkIn);
      if (checkOut) qs.set('checkOut', checkOut);
      qs.set('guests', encodeGuests(guests));
      // Price: omit if at full bounds.
      if (filter.priceMin > bounds.min || filter.priceMax < bounds.max) {
        qs.set('price', `${filter.priceMin}-${filter.priceMax}`);
      }
      if (filter.stars.size > 0) qs.set('stars', Array.from(filter.stars).sort().join(','));
      if (filter.amenities.size > 0) qs.set('amenities', Array.from(filter.amenities).join(','));
      if (filter.maxDistanceKm < 25) qs.set('maxKm', String(filter.maxDistanceKm));
      if (sort !== 'recommended') qs.set('sort', sort);
      if (view !== 'list') qs.set('view', view);
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
    }, 200);
    return () => { if (writeTimer.current) window.clearTimeout(writeTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, checkIn, checkOut, guests, filter, sort, view]);

  // Apply filters.
  const filtered = useMemo(() => {
    return allHotels.filter(h => {
      if (h.price < filter.priceMin || h.price > filter.priceMax) return false;
      if (filter.stars.size > 0 && !filter.stars.has(h.stars)) return false;
      if (filter.maxDistanceKm < 25 && h.distanceKm > filter.maxDistanceKm) return false;
      if (filter.amenities.size > 0) {
        for (const need of filter.amenities) {
          if (!h.amenities.includes(need)) return false;
        }
      }
      return true;
    });
  }, [allHotels, filter]);

  // Apply sort.
  const sorted = useMemo(() => sortHotels(filtered, sort), [filtered, sort]);

  // Click handlers for the split view.
  const onMarkerClick = (id: string) => setSelectedId(id);
  const onSelectHotel = (id: string) => setSelectedId(id);

  // Convenience helper for the price-chart adults arg.
  const { adults: totalAdults } = totalGuests(guests);

  return (
    <div className="space-y-6">
      <HotelsSearchPanel
        destination={destination}
        checkIn={checkIn}
        checkOut={checkOut}
        adults={totalAdults}
        guests={guests}
        trackedDestinations={trackedDestinations}
        onDestinationChange={setDestination}
        onCheckInChange={setCheckIn}
        onCheckOutChange={setCheckOut}
        onAdultsChange={() => { /* adults derived from guests */ }}
        onGuestsChange={setGuests}
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <HotelsPriceChart location={destination} adults={totalAdults} months={6} />
        </div>
        <HotelsMiniGlobe destination={destination} />
      </div>

      {/* View toggle + sort */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: 'var(--muted)' }}>Sort by:</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="ed-input"
            style={{ width: 'auto' }}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div className="ed-seg">
          {(['list', 'split', 'map'] as ViewMode[]).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`ed-seg-btn${view === v ? ' active' : ''}`}
            >
              {v === 'list' ? 'List view' : v === 'split' ? 'Split view' : 'Map view'}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile-only chip row — visible < lg; opens bottom-sheet drawers. */}
      <HotelsFilterChipsMobile
        state={filter}
        onChange={setFilter}
        bounds={bounds}
        onReset={() => setFilter(defaultFilterState(bounds))}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
        {/* Desktop-only left rail — chips replace it on < lg. */}
        <div className="hidden lg:block">
          <HotelsFilterRail
            state={filter}
            onChange={setFilter}
            bounds={bounds}
            onReset={() => setFilter(defaultFilterState(bounds))}
          />
        </div>

        {view === 'list' && (
          <HotelsGrid
            location={destination}
            checkIn={checkIn}
            checkOut={checkOut}
            guests={guests}
            hotels={sorted}
            totalCount={allHotels.length}
            layout="grid"
            selectedId={selectedId}
            onHoverHotel={setHoveredId}
            onSelectHotel={onSelectHotel}
          />
        )}

        {view === 'map' && (
          <HotelsMap
            destination={destination}
            hotels={sorted}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onMarkerClick={onMarkerClick}
            height={620}
          />
        )}

        {view === 'split' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="max-h-[620px] overflow-y-auto">
              <HotelsGrid
                location={destination}
                checkIn={checkIn}
                checkOut={checkOut}
                guests={guests}
                hotels={sorted}
                totalCount={allHotels.length}
                layout="list"
                selectedId={selectedId}
                onHoverHotel={setHoveredId}
                onSelectHotel={onSelectHotel}
              />
            </div>
            <div className="sticky top-4 self-start">
              <HotelsMap
                destination={destination}
                hotels={sorted}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onMarkerClick={onMarkerClick}
                height={620}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function sortHotels(list: Hotel[], key: SortKey): Hotel[] {
  const copy = [...list];
  switch (key) {
    case 'cheap':    return copy.sort((a, b) => a.price - b.price);
    case 'deal':     return copy.sort((a, b) => (b.rating / b.price) - (a.rating / a.price));
    case 'rating':   return copy.sort((a, b) => b.rating - a.rating);
    case 'distance': return copy.sort((a, b) => a.distanceKm - b.distanceKm);
    case 'reviews':  return copy.sort((a, b) => b.reviewCount - a.reviewCount);
    case 'recommended':
    default:         return copy;
  }
}

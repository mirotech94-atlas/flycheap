'use client';

import { useEffect, useRef } from 'react';
import { hotelCityForDestination, buildBookingUrl, buildExpediaUrl } from '@/lib/affiliate';
import type { Hotel, HotelProviderQuote } from '@/lib/hotelMockData';
import type { GuestsState } from './HotelsGuestsPicker';
import { totalGuests } from './HotelsGuestsPicker';
import { buildPartnerLink, routeIdFor, type PartnerId } from '@/lib/partnerLink';

// Area-based fallback tiles (the original HotelsGrid behaviour). Now rendered
// as a secondary "Browse by neighborhood" section below the hotel cards so we
// keep the discovery surface while showing real Kayak-style cards.
const AREAS_BY_CITY: Record<string, Array<{ name: string; query: string; vibe: string }>> = {
  CAI: [
    { name: 'Downtown Cairo', query: 'Downtown Cairo', vibe: 'Walk to the museum & Tahrir' },
    { name: 'Zamalek', query: 'Zamalek Cairo', vibe: 'Leafy island, cafes, embassies' },
    { name: 'Giza Pyramids', query: 'Giza Pyramids', vibe: 'Pyramid-view rooms' },
    { name: 'Garden City', query: 'Garden City Cairo', vibe: 'Quiet riverside, walkable' },
    { name: 'Maadi', query: 'Maadi Cairo', vibe: 'Suburban, expat-friendly' },
    { name: 'New Cairo', query: 'New Cairo', vibe: 'Modern malls + business' },
  ],
  LHR: [
    { name: 'Mayfair', query: 'Mayfair London', vibe: 'Five-star, walkable West End' },
    { name: 'Covent Garden', query: 'Covent Garden London', vibe: 'Theatres, shopping' },
    { name: 'Shoreditch', query: 'Shoreditch London', vibe: 'East-side, food + nightlife' },
    { name: 'South Bank', query: 'South Bank London', vibe: 'River-side, family-friendly' },
  ],
  CDG: [
    { name: 'Le Marais', query: 'Le Marais Paris', vibe: 'Boutique + nightlife' },
    { name: 'Saint-Germain', query: 'Saint-Germain Paris', vibe: 'Left Bank classic' },
    { name: 'Montmartre', query: 'Montmartre Paris', vibe: 'Hilltop, Sacré-Cœur' },
  ],
  DXB: [
    { name: 'Downtown Dubai', query: 'Downtown Dubai', vibe: 'Burj Khalifa + Dubai Mall' },
    { name: 'Marina', query: 'Dubai Marina', vibe: 'Beach + skyline' },
    { name: 'Palm Jumeirah', query: 'Palm Jumeirah Dubai', vibe: 'Resort-style' },
  ],
};

function buildProviderHref(opts: {
  quote: HotelProviderQuote;
  hotel: Hotel;
  destination: string;
  checkIn: string;
  checkOut: string;
  guests: GuestsState;
}): string {
  const { quote, destination, checkIn, checkOut, guests } = opts;
  const city = hotelCityForDestination(destination);
  const { adults, children, childAges } = totalGuests(guests);

  let dest: URL;
  // Provider key always reflects the brand the user clicked (booking, expedia,
  // hotellook, ...). Previously the Booking / Expedia chips logged
  // provider=unknown because no affiliate id was configured — that hid the
  // user-preference signal in the dashboard. Now we log the brand regardless;
  // affiliate-id presence only affects whether the outbound URL carries the
  // monetization params.
  const provider: string = quote.provider;
  if (quote.provider === 'hotellook') {
    dest = new URL('https://search.hotellook.com/');
    dest.searchParams.set('destination', city);
    dest.searchParams.set('checkIn', checkIn);
    dest.searchParams.set('checkOut', checkOut);
    dest.searchParams.set('adults', String(adults));
    if (children > 0) dest.searchParams.set('children', String(children));
    if (childAges.length) dest.searchParams.set('childAge', childAges.join(','));
  } else if (quote.provider === 'booking') {
    dest = new URL(buildBookingUrl({ city, checkIn, checkOut, adults, children, label: 'hotels-grid' }));
  } else if (quote.provider === 'expedia') {
    dest = new URL(buildExpediaUrl({ city, checkIn, checkOut, adults, clickref: 'hotels-grid' }));
  } else if (quote.provider === 'agoda') {
    dest = new URL('https://www.agoda.com/search');
    dest.searchParams.set('city', city);
    dest.searchParams.set('checkIn', checkIn);
    dest.searchParams.set('checkOut', checkOut);
    dest.searchParams.set('adults', String(adults));
    if (children > 0) dest.searchParams.set('children', String(children));
  } else if (quote.provider === 'trip') {
    dest = new URL('https://www.trip.com/hotels/list');
    dest.searchParams.set('city', city);
    dest.searchParams.set('checkin', checkIn);
    dest.searchParams.set('checkout', checkOut);
    dest.searchParams.set('adult', String(adults));
    if (children > 0) dest.searchParams.set('children', String(children));
  } else {
    dest = new URL('https://www.hotels.com/Hotel-Search');
    dest.searchParams.set('destination', city);
    dest.searchParams.set('startDate', checkIn);
    dest.searchParams.set('endDate', checkOut);
    dest.searchParams.set('adults', String(adults));
  }
  // Hotels are the biggest-paying product in the catalog; untagged hotel clicks
  // are the most expensive kind to lose track of.
  return buildPartnerLink({
    partner: provider as PartnerId, product: 'hotel', deeplink: dest.toString(),
    context: { surface: 'hotels-grid', routeId: destination || null },
  });
}

function buildAreaHref(area: string, destination: string, checkIn: string, checkOut: string, guests: GuestsState): string {
  const dest = area || hotelCityForDestination(destination);
  const { adults } = totalGuests(guests);
  const u = new URL('https://search.hotellook.com/');
  u.searchParams.set('destination', dest);
  u.searchParams.set('checkIn', checkIn);
  u.searchParams.set('checkOut', checkOut);
  u.searchParams.set('adults', String(adults));
  return buildPartnerLink({
    partner: 'hotellook', product: 'hotel', deeplink: u.toString(),
    context: { surface: 'hotels-grid', routeId: destination || null },
  });
}

/**
 * Hotel cards grid. Renders Kayak-style cards with:
 *   - name + stars + tagline + area
 *   - $/night + rating + review count
 *   - up to 3 provider chips (Hotellook real affiliate; Booking/Expedia mocked)
 *
 * When `layout="list"`, cards reflow into a single column for the split-view
 * (map alongside list). When `layout="grid"`, a 3-column responsive grid.
 *
 * Card hover bubbles a hoveredId so the map can enlarge the matching marker.
 * When `selectedId` matches a card, it gets a gold outline + smooth scroll.
 */
export function HotelsGrid({
  location,
  checkIn,
  checkOut,
  guests,
  hotels,
  totalCount,
  layout = 'grid',
  selectedId = null,
  onHoverHotel,
  onSelectHotel,
}: {
  location: string;
  checkIn: string;
  checkOut: string;
  guests: GuestsState;
  hotels: Hotel[];
  totalCount: number;
  layout?: 'grid' | 'list';
  selectedId?: string | null;
  onHoverHotel?: (id: string | null) => void;
  onSelectHotel?: (id: string) => void;
}) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Smooth-scroll selected card into view + briefly outline in gold.
  useEffect(() => {
    if (!selectedId) return;
    const el = cardRefs.current.get(selectedId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-amber-400');
      const t = window.setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400'), 1800);
      return () => window.clearTimeout(t);
    }
  }, [selectedId]);

  const areas = AREAS_BY_CITY[location.toUpperCase()];

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow text-cyan-700">Stays in {location.toUpperCase()}</div>
          <h2 className="!mb-0">Hotels</h2>
        </div>
        <div className="text-[11px] tabular" style={{ color: 'var(--text-muted, #64748b)' }}>
          Showing {hotels.length} of {totalCount}
        </div>
      </div>

      {hotels.length === 0 ? (
        <div className="text-xs py-8 text-center" style={{ color: 'var(--text-muted, #64748b)' }}>
          No hotels match the current filters. Try widening the price range or unchecking some amenities.
        </div>
      ) : (
        <div className={layout === 'list' ? 'space-y-2' : 'grid md:grid-cols-2 lg:grid-cols-3 gap-3'}>
          {hotels.map(h => (
            <div
              key={h.id}
              ref={(el) => { if (el) cardRefs.current.set(h.id, el); else cardRefs.current.delete(h.id); }}
              onMouseEnter={() => onHoverHotel?.(h.id)}
              onMouseLeave={() => onHoverHotel?.(null)}
              onClick={() => onSelectHotel?.(h.id)}
              className="rounded-lg border p-3 cursor-pointer transition-all hover:shadow-lift hover:-translate-y-0.5"
              style={{ background: 'var(--bg-elevated, white)', color: 'var(--text)', borderColor: 'var(--border, rgba(148,163,184,0.3))' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-display font-semibold text-sm leading-tight truncate" style={{ color: 'var(--text)' }}>
                    {h.name} <span className="text-amber-500">· {h.stars}★</span>
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted, #64748b)' }}>{h.area} · {h.distanceKm.toFixed(1)} km from center</div>
                  <div className="text-[11px] italic mt-1" style={{ color: 'var(--text-muted, #64748b)' }}>&ldquo;{h.tagline}&rdquo;</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-base tabular-nums" style={{ color: 'var(--text)' }}>${h.price}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted, #64748b)' }}>/ night</div>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className="text-amber-500">⭐ {h.rating.toFixed(1)}</span>
                <span style={{ color: 'var(--text-muted, #64748b)' }}>({h.reviewCount.toLocaleString()} reviews)</span>
              </div>

              {h.amenities.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {h.amenities.slice(0, 4).map(a => (
                    <span key={a} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(14,165,233,0.10)', color: 'var(--text-muted, #0369a1)' }}>{a}</span>
                  ))}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {h.providerQuotes.map(q => (
                  <a
                    key={q.provider}
                    href={buildProviderHref({ quote: q, hotel: h, destination: location, checkIn, checkOut, guests })}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] px-2 py-0.5 rounded border transition-colors hover:bg-cyan-50"
                    style={{ borderColor: 'var(--border, rgba(148,163,184,0.4))', color: 'var(--text)' }}
                  >
                    {q.label} <span className="font-semibold">${q.price}</span>
                  </a>
                ))}
                <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted, #64748b)' }}>
                  Compare {h.providerQuotes.length} deals →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {areas && areas.length > 0 && (
        <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border, rgba(148,163,184,0.25))' }}>
          <div className="eyebrow text-cyan-700 mb-2">Or browse by neighborhood</div>
          <div className="grid md:grid-cols-3 gap-2">
            {areas.map(area => (
              <a
                key={area.name}
                href={buildAreaHref(area.query, location, checkIn, checkOut, guests)}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-2 rounded border text-xs hover:shadow-lift transition-all"
                style={{ background: 'var(--bg-elevated, white)', color: 'var(--text)', borderColor: 'var(--border, rgba(148,163,184,0.3))' }}
              >
                <div className="font-semibold">{area.name}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted, #64748b)' }}>{area.vibe}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

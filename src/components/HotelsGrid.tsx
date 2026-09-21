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
 * When `selectedId` matches a card, it gets an accent outline (`.ed-tile.active`)
 * + smooth scroll.
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

  // Smooth-scroll selected card into view + briefly outline it (accent, not
  // amber — a selection highlight isn't a fare digit or a delta, so it
  // doesn't get the reserved colour; `.ed-tile.active` is the same outline
  // token every other selected tile in the app uses).
  useEffect(() => {
    if (!selectedId) return;
    const el = cardRefs.current.get(selectedId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('active');
      const t = window.setTimeout(() => el.classList.remove('active'), 1800);
      return () => window.clearTimeout(t);
    }
  }, [selectedId]);

  const areas = AREAS_BY_CITY[location.toUpperCase()];

  return (
    <div className="ed-panel">
      <div className="ed-panel-head">
        <div>
          <div className="ed-eyebrow">Stays in {location.toUpperCase()}</div>
          <h2 className="ed-panel-title">Hotels</h2>
        </div>
        <div className="tabular" style={{ fontSize: 11, color: 'var(--muted)' }}>
          Showing {hotels.length} of {totalCount}
        </div>
      </div>

      {hotels.length === 0 ? (
        <div className="py-8 text-center" style={{ fontSize: 12, color: 'var(--muted)' }}>
          No hotels match the current filters. Try widening the price range or unchecking some amenities.
        </div>
      ) : (
        <div className="ed-tiles" style={layout === 'list' ? { gridTemplateColumns: '1fr' } : undefined}>
          {hotels.map(h => (
            <div
              key={h.id}
              ref={(el) => { if (el) cardRefs.current.set(h.id, el); else cardRefs.current.delete(h.id); }}
              onMouseEnter={() => onHoverHotel?.(h.id)}
              onMouseLeave={() => onHoverHotel?.(null)}
              onClick={() => onSelectHotel?.(h.id)}
              className="ed-tile"
              style={{ cursor: 'pointer' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="ed-tile-value truncate" style={{ fontSize: 15 }}>
                    {h.name} <span style={{ color: 'var(--ink)' }}>· {h.stars}★</span>
                  </div>
                  <div className="ed-tile-meta">{h.area} · {h.distanceKm.toFixed(1)} km from center</div>
                  <div className="ed-tile-meta" style={{ fontStyle: 'italic', marginTop: 4 }}>&ldquo;{h.tagline}&rdquo;</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="tabular-nums" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 17, color: 'var(--ink)' }}>${h.price}</div>
                  <div className="ed-tile-meta" style={{ fontSize: 10 }}>/ night</div>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2" style={{ fontSize: 11 }}>
                {/* Amber at this weight/size measured 2.92:1 on --surface — below
                    AA. Ink carries the value; the ★ glyph carries the meaning. */}
                <span style={{ color: 'var(--ink)' }}>★ {h.rating.toFixed(1)}</span>
                <span className="ed-tile-meta">({h.reviewCount.toLocaleString()} reviews)</span>
              </div>

              {h.amenities.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {h.amenities.slice(0, 4).map(a => (
                    <span key={a} className="ed-chip" style={{ padding: '2px 8px', fontSize: 10 }}>{a}</span>
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
                    className="ed-btn ed-btn-tile"
                    style={{ fontSize: 10, padding: '4px 8px' }}
                  >
                    {q.label} <span style={{ fontWeight: 600 }}>${q.price}</span>
                  </a>
                ))}
                <span className="ed-tile-meta ml-auto" style={{ fontSize: 10 }}>
                  Compare {h.providerQuotes.length} deals →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {areas && areas.length > 0 && (
        <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="ed-eyebrow" style={{ marginBottom: 8 }}>Or browse by neighborhood</div>
          <div className="ed-tiles">
            {areas.map(area => (
              <a
                key={area.name}
                href={buildAreaHref(area.query, location, checkIn, checkOut, guests)}
                target="_blank"
                rel="noopener noreferrer"
                className="ed-tile"
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{area.name}</div>
                <div className="ed-tile-meta">{area.vibe}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

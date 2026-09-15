'use client';

import { useState } from 'react';
import Link from 'next/link';
import { hotelCityForDestination, buildBookingUrl } from '@/lib/affiliate';
import { DatePopover } from './DatePopover';
import { HotelsGuestsPicker, totalGuests, defaultGuests, type GuestsState } from './HotelsGuestsPicker';

type Provider = 'hotellook' | 'tripcom' | 'travelpayouts' | 'booking';

const PROVIDER_LABELS: Record<Provider, string> = {
  hotellook: 'Hotellook (Travelpayouts)',
  tripcom: 'Trip.com',
  travelpayouts: 'Travelpayouts metasearch',
  booking: 'Booking.com',
};

// Curated destination catalog for the hotel dropdown. Grouped so users land
// on resort destinations (Sharm, Hurghada, Marsa Alam, Maldives, Cancun, etc.)
// without having to type IATA codes. Each entry's code maps via
// `hotelCityForDestination()` to a plain city name accepted by Hotellook's
// /search endpoint. Adding a new code? Mirror it in lib/affiliate.ts
// IATA_TO_CITY_FOR_HOTEL or the link will silently fall back to the raw token.
const DEST_GROUPS: Array<{ label: string; items: Array<{ code: string; name: string; tag?: string }> }> = [
  {
    label: 'Egypt · sun & sea',
    items: [
      { code: 'SSH', name: 'Sharm El Sheikh', tag: 'All-inclusive' },
      { code: 'HRG', name: 'Hurghada', tag: 'All-inclusive' },
      { code: 'RMF', name: 'Marsa Alam', tag: 'Diving' },
      { code: 'CAI', name: 'Cairo' },
      { code: 'LXR', name: 'Luxor' },
      { code: 'ASW', name: 'Aswan' },
      { code: 'HBE', name: 'Alexandria' },
    ],
  },
  {
    label: 'Beach & islands',
    items: [
      { code: 'MLE', name: 'Maldives' },
      { code: 'DPS', name: 'Bali' },
      { code: 'HKT', name: 'Phuket' },
      { code: 'CUN', name: 'Cancun' },
      { code: 'PUJ', name: 'Punta Cana' },
      { code: 'NAS', name: 'Nassau, Bahamas' },
      { code: 'OGG', name: 'Maui' },
      { code: 'HNL', name: 'Honolulu' },
    ],
  },
  {
    label: 'Mediterranean',
    items: [
      { code: 'JTR', name: 'Santorini' },
      { code: 'JMK', name: 'Mykonos' },
      { code: 'CFU', name: 'Corfu' },
      { code: 'HER', name: 'Crete' },
      { code: 'RHO', name: 'Rhodes' },
      { code: 'PMI', name: 'Mallorca' },
      { code: 'IBZ', name: 'Ibiza' },
      { code: 'TFS', name: 'Tenerife' },
      { code: 'AYT', name: 'Antalya' },
      { code: 'BJV', name: 'Bodrum' },
      { code: 'LCA', name: 'Larnaca, Cyprus' },
      { code: 'PFO', name: 'Paphos, Cyprus' },
    ],
  },
  {
    label: 'City breaks',
    items: [
      { code: 'DXB', name: 'Dubai' },
      { code: 'IST', name: 'Istanbul' },
      { code: 'LON', name: 'London' },
      { code: 'PAR', name: 'Paris' },
      { code: 'ROM', name: 'Rome' },
      { code: 'BCN', name: 'Barcelona' },
      { code: 'AMS', name: 'Amsterdam' },
      { code: 'NYC', name: 'New York' },
      { code: 'TYO', name: 'Tokyo' },
      { code: 'BKK', name: 'Bangkok' },
      { code: 'SIN', name: 'Singapore' },
    ],
  },
];

// Flat lookup so we can label the currently-selected option with its city
// name even when the user came in via a tracked-search shortcut.
const DEST_LABEL_BY_CODE: Record<string, string> = (() => {
  const r: Record<string, string> = {};
  for (const g of DEST_GROUPS) for (const it of g.items) r[it.code] = it.name;
  return r;
})();

function buildHotelUrl(p: Provider, opts: { destination: string; checkIn: string; checkOut: string; adults: number; children?: number; childAges?: number[] }): string {
  const { destination, checkIn, checkOut, adults, children = 0, childAges = [] } = opts;
  // Hotel-search engines reject 3-letter IATA codes silently. Resolve to a
  // plain city name (CAI → Cairo, JFK → New York) so the destination param
  // is actually honoured. /go appends `marker`/`sub_id` server-side.
  const cityForHotels = hotelCityForDestination(destination);

  if (p === 'hotellook') {
    const u = new URL('https://search.hotellook.com/');
    u.searchParams.set('destination', cityForHotels);
    u.searchParams.set('checkIn', checkIn);
    u.searchParams.set('checkOut', checkOut);
    u.searchParams.set('adults', String(adults));
    if (children > 0) {
      u.searchParams.set('children', String(children));
      if (childAges.length) u.searchParams.set('childAge', childAges.join(','));
    }
    return `/go?to=${encodeURIComponent(u.toString())}&provider=hotellook&surface=offers-page`;
  }
  if (p === 'tripcom') {
    const u = new URL('https://www.trip.com/hotels/list');
    u.searchParams.set('city', cityForHotels);
    u.searchParams.set('checkin', checkIn);
    u.searchParams.set('checkout', checkOut);
    u.searchParams.set('adult', String(adults));
    return `/go?to=${encodeURIComponent(u.toString())}&provider=tripcom&surface=offers-page`;
  }
  if (p === 'travelpayouts') {
    // Travelpayouts metasearch — link to its hotel search with a real city.
    const u = new URL('https://www.travelpayouts.com/hotels');
    u.searchParams.set('destination', cityForHotels);
    u.searchParams.set('checkIn', checkIn);
    u.searchParams.set('checkOut', checkOut);
    u.searchParams.set('adults', String(adults));
    return `/go?to=${encodeURIComponent(u.toString())}&provider=travelpayouts&surface=offers-page`;
  }
  // booking — buildBookingUrl appends ?aid=&label= when NEXT_PUBLIC_BOOKING_AID
  // is set; otherwise sends a plain deeplink. Provider is always 'booking' so
  // the click dashboard reflects user preference even pre-affiliate-signup.
  const bookingUrl = buildBookingUrl({
    city: cityForHotels,
    checkIn,
    checkOut,
    adults,
    children,
    label: 'offers-page',
  });
  return `/go?to=${encodeURIComponent(bookingUrl)}&provider=booking&surface=offers-page`;
}

export function HotelsSearchPanel(props: {
  // Controlled mode (preferred — keeps grid / chart / globe in sync).
  destination?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  guests?: GuestsState;
  onDestinationChange?: (v: string) => void;
  onCheckInChange?: (v: string) => void;
  onCheckOutChange?: (v: string) => void;
  onAdultsChange?: (v: number) => void;
  onGuestsChange?: (v: GuestsState) => void;
  // Uncontrolled fallback.
  destinationDefault?: string;
  checkInDefault?: string;
  checkOutDefault?: string;
  adultsDefault?: number;
  trackedDestinations: string[];
}) {
  // Internal state used only when the consumer isn't passing controlled props.
  const [destinationU, setDestinationU] = useState(props.destinationDefault ?? props.destination ?? 'CAI');
  const [checkInU, setCheckInU] = useState(props.checkInDefault ?? props.checkIn ?? '');
  const [checkOutU, setCheckOutU] = useState(props.checkOutDefault ?? props.checkOut ?? '');
  const [adultsU, setAdultsU] = useState(props.adultsDefault ?? props.adults ?? 2);

  const destination = props.destination ?? destinationU;
  const checkIn = props.checkIn ?? checkInU;
  const checkOut = props.checkOut ?? checkOutU;
  const adults = props.adults ?? adultsU;
  const setDestination = (v: string) => (props.onDestinationChange ?? setDestinationU)(v);
  const setCheckIn = (v: string) => (props.onCheckInChange ?? setCheckInU)(v);
  const setCheckOut = (v: string) => (props.onCheckOutChange ?? setCheckOutU)(v);
  const setAdults = (v: number) => (props.onAdultsChange ?? setAdultsU)(v);
  const trackedDestinations = props.trackedDestinations;
  const [provider, setProvider] = useState<Provider>('hotellook');

  // Guests state: controlled if parent passes `guests`, else internal.
  // The internal seed uses `adults` so the legacy adults-only path still works.
  const [guestsU, setGuestsU] = useState<GuestsState>(() => defaultGuests(adults));
  const guests = props.guests ?? guestsU;
  const setGuests = (g: GuestsState) => {
    (props.onGuestsChange ?? setGuestsU)(g);
    // Mirror total adults back into the legacy adults state so the price chart
    // and any non-guests-aware consumer still gets a sensible number.
    const tot = totalGuests(g).adults;
    setAdults(tot);
  };
  const { adults: totalAdults, children: totalChildren, childAges } = totalGuests(guests);

  const url = buildHotelUrl(provider, { destination, checkIn, checkOut, adults: totalAdults, children: totalChildren, childAges });
  const nights = Math.max(0, Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24),
  ));

  return (
    <div className="card card-feature">
      <div className="card-head">
        <div>
          <div className="eyebrow text-cyan-700">Hotel search</div>
          <h2 className="!mb-0">Find a place to stay</h2>
        </div>
        <span className="badge badge-info">{nights} {nights === 1 ? 'night' : 'nights'}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-800">
        <label className="text-xs text-slate-500 col-span-2">
          <span className="block mb-1">Destination</span>
          {/* Grouped dropdown: tracked routes first (so the user's pinned
              destinations are one click away), then curated resort/beach/
              city groups. Each <optgroup> is a discoverable section. */}
          <select
            value={destination}
            onChange={e => setDestination(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          >
            {trackedDestinations.length > 0 && (
              <optgroup label="Your tracked routes">
                {Array.from(new Set(trackedDestinations)).map(d => (
                  <option key={`t-${d}`} value={d}>
                    {d}{DEST_LABEL_BY_CODE[d] ? ` — ${DEST_LABEL_BY_CODE[d]}` : ''}
                  </option>
                ))}
              </optgroup>
            )}
            {DEST_GROUPS.map(g => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map(it => (
                  <option key={`${g.label}-${it.code}`} value={it.code}>
                    {it.name} ({it.code}){it.tag ? ` · ${it.tag}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="text-xs text-slate-500">
          <span className="block mb-1">Check-in</span>
          <DatePopover label="" value={checkIn} onChange={setCheckIn} />
        </div>

        <div className="text-xs text-slate-500">
          <span className="block mb-1">Check-out</span>
          <DatePopover label="" value={checkOut} onChange={setCheckOut} minDate={checkIn} />
        </div>

        <div className="text-xs text-slate-500">
          <span className="block mb-1">Guests</span>
          <HotelsGuestsPicker value={guests} onChange={setGuests} />
        </div>

        <label className="text-xs text-slate-500 col-span-2 md:col-span-3">
          <span className="block mb-1">Provider</span>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value as Provider)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          >
            {(Object.keys(PROVIDER_LABELS) as Provider[]).map(p => (
              <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
            ))}
          </select>
        </label>

        <div className="col-span-2 md:col-span-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary text-xs w-full text-center"
          >
            Search on {PROVIDER_LABELS[provider]} →
          </a>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 mt-2">
        Affiliate-tracked through <code>/go</code> when an affiliate ID is configured for the chosen provider. Booking.com falls back to a public deeplink until its affiliate ID is set.
        {' '}
        <Link
          href={`/rentals?destination=${encodeURIComponent(destination)}&checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}&adults=${encodeURIComponent(String(totalAdults))}`}
          className="text-cyan-700 dark:text-cyan-400 underline underline-offset-2"
        >
          Vacation rentals →
        </Link>
      </p>
    </div>
  );
}

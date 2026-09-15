import { hotellookLink, tripcomHotelLink, airbnbLink, vrboLink, trackedRedirect, buildRouteId, tpBrandConfigured, type AffiliateSurface } from '@/lib/affiliate';
import { cityName } from '@/lib/explore';

interface Props {
  origin: string;
  destinationIata: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  surface: AffiliateSurface;
  /** Override the auto-generated routeId for fine-grained attribution. */
  routeId?: string;
}

export function HotelUpsell({
  origin,
  destinationIata,
  checkIn,
  checkOut,
  adults = 2,
  surface,
  routeId,
}: Props) {
  const city = cityName(destinationIata).replace(/\s*\([^)]*\)\s*/g, '').trim();
  const rid = routeId ?? buildRouteId({
    origin,
    destination: destinationIata,
    departDate: checkIn,
    returnDate: checkOut,
    adults,
  });
  // Primary: Hotellook (Travelpayouts) — broad coverage, marker 727998
  const hotellookUrl = hotellookLink({
    destination: destinationIata,
    checkIn,
    checkOut,
    adults,
    surface,
    routeId: rid,
  });
  const hotellookHref = trackedRedirect(hotellookUrl, { surface, routeId: rid });

  // Secondary: Trip.com — often beats Hotellook on Asia routes (Tokyo, Bangkok,
  // Bali, Hong Kong, Seoul). Per-booking commission $5-15 or 4-7% per night.
  const tripcomUrl = tripcomHotelLink({
    destinationCity: city,
    checkIn,
    checkOut,
    adults,
    surface,
    routeId: rid,
  });
  const tripcomHref = trackedRedirect(tripcomUrl, { surface, routeId: rid, provider: 'tripcom' });

  // Homes: Airbnb (deep link — no affiliate program) + Vrbo. Prefilled with the same dates/guests.
  const airbnbHref = trackedRedirect(airbnbLink({ destinationCity: city, checkIn, checkOut, adults }), { surface, routeId: rid, provider: 'airbnb' });
  const vrboHref = trackedRedirect(vrboLink({ destinationCity: city, checkIn, checkOut, adults }), { surface, routeId: rid, provider: 'vrbo' });

  // Airport transfer (Kiwitaxi via Travelpayouts — 50% revenue share). This is
  // the only surface that knows both the arrival airport and the arrival date,
  // which is what a transfer quote needs. Hidden entirely until configured.
  const transferHref = tpBrandConfigured('kiwitaxi')
    ? `/go?brand=kiwitaxi&surface=${encodeURIComponent(surface)}&route_id=${encodeURIComponent(rid)}&destination=${encodeURIComponent(destinationIata)}&dep=${encodeURIComponent(checkIn)}`
    : null;

  const nights = Math.max(0, Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24),
  ));

  return (
    <div className="card overflow-hidden relative bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/30 dark:to-slate-900/40 border-cyan-200/60 dark:border-cyan-800/40">
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />
      <div className="eyebrow text-cyan-700 dark:text-cyan-400">Where you sleep</div>
      <h2 className="!mb-2 mt-1">Stay in {city} for {nights} {nights === 1 ? 'night' : 'nights'}</h2>
      <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        Compare hotels in {city} for {checkIn} → {checkOut} ({adults} {adults === 1 ? 'adult' : 'adults'}). Cached prices from 70+ booking sites.
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={hotellookHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary inline-flex"
        >
          Search hotels in {city} →
        </a>
        <a href={airbnbHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary inline-flex text-sm" title="Short-term vacation rentals on Airbnb — whole homes, apartments, rooms — prefilled with these dates and guests">
          Vacation homes on Airbnb →
        </a>
        <a
          href={tripcomHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary inline-flex text-sm"
          title="Trip.com often has the best Asia pricing"
        >
          or check Trip.com →
        </a>
        <a href={vrboHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary inline-flex text-sm" title="Vacation rentals on Vrbo, prefilled with these dates">
          Vrbo →
        </a>
      </div>
      {transferHref && (
        <div className="mt-3 pt-3 border-t border-cyan-200/50 dark:border-cyan-800/30 text-sm text-slate-600 dark:text-slate-400">
          Landing at {destinationIata} on {checkIn}?{' '}
          <a href={transferHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-cyan-700 dark:text-cyan-400 underline underline-offset-2">
            Book a fixed-price airport transfer
          </a>{' '}
          — driver meets you, price agreed before you fly.
        </div>
      )}
      <div className="text-[11px] text-slate-400 mt-2">Airbnb and Vrbo are vacation-rental searches (short-term stays only) prefilled with your dates — plain links, no commission. Hotel links via Hotellook/Trip.com may earn us a commission at no cost to you.</div>
    </div>
  );
}

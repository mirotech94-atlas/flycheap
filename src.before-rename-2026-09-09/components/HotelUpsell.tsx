import { hotellookLink, tripcomHotelLink, trackedRedirect, buildRouteId, type AffiliateSurface } from '@/lib/affiliate';
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
        <a
          href={tripcomHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary inline-flex text-sm"
          title="Trip.com often has the best Asia pricing"
        >
          or check Trip.com →
        </a>
      </div>
    </div>
  );
}

import Link from 'next/link';
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
  /** 'hotel' (default) searches Hotellook/Trip.com; 'airbnb' searches Airbnb/Vrbo. */
  mode?: 'hotel' | 'airbnb';
}

export function HotelUpsell({
  origin,
  destinationIata,
  checkIn,
  checkOut,
  adults = 2,
  surface,
  routeId,
  mode = 'hotel',
}: Props) {
  const city = cityName(destinationIata).replace(/\s*\([^)]*\)\s*/g, '').trim();
  const rid = routeId ?? buildRouteId({
    origin,
    destination: destinationIata,
    departDate: checkIn,
    returnDate: checkOut,
    adults,
  });

  // Hotel mode: Hotellook (primary) + Trip.com (secondary).
  const hotellookUrl = hotellookLink({
    destination: destinationIata,
    checkIn,
    checkOut,
    adults,
    surface,
    routeId: rid,
  });
  const hotellookHref = trackedRedirect(hotellookUrl, { surface, routeId: rid });

  const tripcomUrl = tripcomHotelLink({
    destinationCity: city,
    checkIn,
    checkOut,
    adults,
    surface,
    routeId: rid,
  });
  const tripcomHref = trackedRedirect(tripcomUrl, { surface, routeId: rid, provider: 'tripcom' });

  // Airbnb mode: Airbnb (primary) + Vrbo (secondary). No affiliate program for
  // either — clicks are still logged through /go for the click dashboard.
  const airbnbHref = trackedRedirect(
    airbnbLink({ destinationCity: city, checkIn, checkOut, adults }),
    { surface, routeId: rid, provider: 'airbnb' },
  );
  const vrboHref = trackedRedirect(
    vrboLink({ destinationCity: city, checkIn, checkOut, adults }),
    { surface, routeId: rid, provider: 'vrbo' },
  );

  // Airport transfer (Kiwitaxi via Travelpayouts — 50% revenue share). This is
  // the only surface that knows both the arrival airport and the arrival date,
  // which is what a transfer quote needs. Hidden entirely until configured.
  const transferHref = tpBrandConfigured('kiwitaxi')
    ? `/go?brand=kiwitaxi&surface=${encodeURIComponent(surface)}&route_id=${encodeURIComponent(rid)}&destination=${encodeURIComponent(destinationIata)}&dep=${encodeURIComponent(checkIn)}`
    : null;

  const otherStayHref = mode === 'hotel'
    ? `/airbnbs?destination=${encodeURIComponent(destinationIata)}&checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}&adults=${encodeURIComponent(String(adults))}`
    : `/hotels?destination=${encodeURIComponent(destinationIata)}&checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}&adults=${encodeURIComponent(String(adults))}`;

  const nights = Math.max(0, Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24),
  ));

  return (
    <div className="card overflow-hidden relative bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/30 dark:to-slate-900/40 border-cyan-200/60 dark:border-cyan-800/40">
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />
      <div className="eyebrow text-cyan-700 dark:text-cyan-400">Where you sleep</div>
      <h2 className="!mb-2 mt-1">Stay in {city} for {nights} {nights === 1 ? 'night' : 'nights'}</h2>
      <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        {mode === 'hotel'
          ? <>Compare hotels in {city} for {checkIn} → {checkOut} ({adults} {adults === 1 ? 'adult' : 'adults'}). Cached prices from 70+ booking sites.</>
          : <>Whole homes and apartments in {city} for {checkIn} → {checkOut} ({adults} {adults === 1 ? 'adult' : 'adults'}).</>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {mode === 'hotel' ? (
          <>
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
          </>
        ) : (
          <>
            <a
              href={airbnbHref}
              target="_blank"
              rel="noopener sponsored"
              className="btn btn-primary inline-flex"
            >
              Search Airbnb in {city} →
            </a>
            <a
              href={vrboHref}
              target="_blank"
              rel="noopener sponsored"
              className="btn btn-secondary inline-flex text-sm"
              title="Vrbo often has more whole-home options for larger groups"
            >
              or check Vrbo →
            </a>
          </>
        )}
        <Link href={otherStayHref} className="btn btn-secondary inline-flex text-sm" title={mode === 'hotel' ? 'Whole-home Airbnbs for these dates and guests' : 'Hotels for these dates and guests'}>
          {mode === 'hotel' ? 'Airbnbs →' : 'Hotels →'}
        </Link>
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
      <div className="text-[11px] text-slate-400 mt-2">
        {mode === 'hotel'
          ? 'Hotel links via Hotellook/Trip.com may earn us a commission at no cost to you.'
          : 'Airbnb and Vrbo searches are plain links prefilled with your dates — no commission.'}
      </div>
    </div>
  );
}

import { getCityGradient } from '@/lib/cityGradients';
import { cityName } from '@/lib/explore';
import { hotellookLink, airbnbLink, trackedRedirect, buildRouteId } from '@/lib/affiliate';
import { placePhoto } from '@/lib/places';
import { airportByCode } from '@/lib/airports';

/**
 * Full-width hero slide shared by the Hotels, Airbnbs and Explore
 * slideshows — a real destination photo when we have one
 * (`public/places/<IATA>.jpg`), falling back to the gradient scene +
 * dotted pattern + IATA watermark when we don't. `mode` swaps the copy and
 * the outbound link between Hotellook (hotels), Airbnb (airbnbs) and a
 * fares link (explore).
 */
export function StayHeroSlide({ iata, checkIn, checkOut, adults, mode }: {
  iata: string; checkIn: string; checkOut: string; adults: number; mode: 'hotel' | 'airbnb' | 'explore';
}) {
  const grad = getCityGradient(iata);
  const city = cityName(iata).replace(/\s*\([^)]*\)\s*/g, '').trim();
  const photo = placePhoto(iata);
  const nights = Math.max(1, Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
  ));

  // Explore has no country lookup for metro codes (e.g. PAR, TYO), so we
  // fall back to the IATA code itself rather than inventing a country.
  const country = airportByCode(iata)?.country ?? iata;

  const rid = buildRouteId({ origin: mode === 'hotel' ? 'HOTEL' : mode === 'airbnb' ? 'AIRBNB' : 'EXPLORE', destination: iata, departDate: checkIn, returnDate: checkOut, adults });
  const href = mode === 'hotel'
    ? trackedRedirect(
        hotellookLink({ destination: iata, checkIn, checkOut, adults, surface: 'hotels-slideshow', routeId: rid }),
        { surface: 'hotels-slideshow', routeId: rid },
      )
    : mode === 'airbnb'
    ? trackedRedirect(
        airbnbLink({ destinationCity: city, checkIn, checkOut, adults }),
        { surface: 'airbnbs-slideshow', routeId: rid, provider: 'airbnb' },
      )
    // Explore doesn't read a destination query param yet — link to the
    // in-page anchor for this destination's card/slide instead.
    : `/explore#${iata}`;

  const eyebrow = mode === 'hotel' ? 'Stay in' : mode === 'airbnb' ? 'Airbnb in' : 'Explore';
  const cta = mode === 'hotel' ? 'Book now →' : mode === 'airbnb' ? 'Search Airbnb →' : 'See fares →';

  return (
    <div className="relative w-full h-full overflow-hidden">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={city} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${grad.from} 0%, ${grad.to} 60%, ${grad.from}dd 100%)` }} />
          <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
          <div className="absolute -right-6 top-1/2 -translate-y-1/2 text-[170px] md:text-[220px] font-black text-white/6 font-mono leading-none select-none pointer-events-none">
            {iata}
          </div>
        </>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />

      <div className="relative h-full flex flex-col justify-center px-8 md:px-14 max-w-2xl">
        <div className="text-white/60 text-xs uppercase tracking-[0.2em] font-semibold mb-1">
          {eyebrow}
        </div>
        <h3 className="text-white font-display font-extrabold text-4xl md:text-5xl tracking-tight leading-none">
          {city}
        </h3>
        <div className="text-white/70 text-sm mt-2">
          {mode === 'explore'
            ? country
            : <>
                {checkIn} → {checkOut} · {nights} night{nights !== 1 ? 's' : ''} · {adults} adult{adults !== 1 ? 's' : ''}
                {mode === 'hotel' ? ' · 70+ booking sites compared' : ''}
              </>}
        </div>
        <div className="mt-5">
          <a
            href={href}
            {...(mode === 'explore' ? {} : { target: '_blank', rel: 'noopener sponsored' })}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-[#E8A33D] text-[#0B1220] hover:bg-[#F2B961] transition shadow-lg"
          >
            {cta}
          </a>
        </div>
      </div>
    </div>
  );
}

import { cityName } from '@/lib/explore';
import { hotellookLink, airbnbLink, trackedRedirect, buildRouteId } from '@/lib/affiliate';
import { placePhoto } from '@/lib/places';
import { airportByCode } from '@/lib/airports';

/**
 * Full-width hero slide shared by the Hotels, Airbnbs and Explore
 * slideshows — a real destination photo when we have one
 * (`public/places/<IATA>.jpg`), falling back to a flat `.ed-photo-hero-
 * fallback` tile with the IATA code watermarked on it when we don't.
 * `mode` swaps the copy and the outbound link between Hotellook (hotels),
 * Airbnb (airbnbs) and a fares link (explore).
 */
export function StayHeroSlide({ iata, checkIn, checkOut, adults, mode }: {
  iata: string; checkIn: string; checkOut: string; adults: number; mode: 'hotel' | 'airbnb' | 'explore';
}) {
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
    <div className="ed-photo-hero">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={city} className="ed-photo-hero-img" />
      ) : (
        <div className="ed-photo-hero-fallback">
          <span className="ed-photo-hero-fallback-code">{iata}</span>
        </div>
      )}

      <div className="ed-photo-hero-band">
        <div className="ed-photo-hero-eyebrow">{eyebrow}</div>
        <h3 className="ed-photo-hero-title">{city}</h3>
        <div className="ed-photo-hero-meta">
          {mode === 'explore'
            ? country
            : <>
                {checkIn} → {checkOut} · {nights} night{nights !== 1 ? 's' : ''} · {adults} adult{adults !== 1 ? 's' : ''}
                {mode === 'hotel' ? ' · 70+ booking sites compared' : ''}
              </>}
        </div>
        <div className="ed-photo-hero-foot">
          <a
            href={href}
            {...(mode === 'explore' ? {} : { target: '_blank', rel: 'noopener sponsored' })}
            className="ed-btn ed-btn-primary ed-btn-hero"
          >
            {cta}
          </a>
        </div>
      </div>
    </div>
  );
}

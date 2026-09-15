import type { SearchRow } from '@/lib/db';

// Worldwide inspiration — used to pad the Hotels/Explore showcase slideshows
// beyond a user's tracked routes. Shared so both pages never drift.
export const POPULAR_HOTEL_CITIES = ['DXB', 'PAR', 'BKK', 'CUN', 'ROM', 'IST', 'MLE', 'TYO'];

export type ShowcaseDestination = { iata: string; checkIn: string; checkOut: string };

/**
 * Builds the ordered list of destinations for the Hotels/Explore hero
 * slideshows: tracked routes first (using each route's real dates), padded
 * with `POPULAR_HOTEL_CITIES` up to `max` entries so the showcase reads as
 * worldwide even when the user has only one or two tracked searches.
 */
export function buildShowcaseDestinations(opts: {
  trackedDestinations: string[];
  searches: Pick<SearchRow, 'destination' | 'depart_date' | 'return_date'>[];
  fallbackCheckIn: string;
  fallbackCheckOut: string;
  max?: number;
}): ShowcaseDestination[] {
  const { trackedDestinations, searches, fallbackCheckIn, fallbackCheckOut, max = 8 } = opts;

  const slideDests: ShowcaseDestination[] = [];
  for (const dest of trackedDestinations.slice(0, 5)) {
    const s = searches.find(x => x.destination === dest)!;
    slideDests.push({ iata: dest, checkIn: s.depart_date, checkOut: s.return_date });
  }
  for (const iata of POPULAR_HOTEL_CITIES) {
    if (slideDests.length >= max) break;
    if (slideDests.some(d => d.iata === iata)) continue;
    slideDests.push({ iata, checkIn: fallbackCheckIn, checkOut: fallbackCheckOut });
  }
  return slideDests;
}

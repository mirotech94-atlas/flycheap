import Link from 'next/link';
import type { Metadata } from 'next';
import { FcPageHead } from '@/components/fc/PageKit';
import { queries } from '@/lib/db';
import { HotelUpsell } from '@/components/HotelUpsell';
import { DealSlideshow } from '@/components/DealSlideshow';
import { StayHeroSlide } from '@/components/StayHeroSlide';
import { DestinationSelect } from '@/components/DestinationSelect';
import { cityName } from '@/lib/explore';
import { airbnbLink, vrboLink, trackedRedirect } from '@/lib/affiliate';

// Worldwide Airbnb inspiration — used to pad the slideshow beyond tracked routes.
const POPULAR_AIRBNB_CITIES = ['DXB', 'PAR', 'BKK', 'CUN', 'ROM', 'IST', 'MLE', 'TYO'];

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Airbnbs | FlyCheap',
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
function parseDay(value: string | undefined, fallback: string): string {
  return value && ISO_DAY.test(value) ? value : fallback;
}
function parseAdults(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n : 2;
}

export default async function AirbnbsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const todayPlus = (days: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const destination = firstParam(params?.destination) ?? 'CAI';
  const checkIn = parseDay(firstParam(params?.checkIn), todayPlus(60));
  const checkOut = parseDay(firstParam(params?.checkOut), todayPlus(67));
  const adults = parseAdults(firstParam(params?.adults));

  const searches = queries.listSearches();
  const trackedDestinations = Array.from(new Set(searches.map(s => s.destination)));

  // Slideshow destinations: tracked routes first (with their real dates), padded
  // with worldwide popular cities so the showcase is global even with few tracked.
  const slideDests: Array<{ iata: string; checkIn: string; checkOut: string }> = [];
  for (const dest of trackedDestinations.slice(0, 5)) {
    const s = searches.find(x => x.destination === dest)!;
    slideDests.push({ iata: dest, checkIn: s.depart_date, checkOut: s.return_date });
  }
  for (const iata of POPULAR_AIRBNB_CITIES) {
    if (slideDests.length >= 8) break;
    if (slideDests.some(d => d.iata === iata)) continue;
    slideDests.push({ iata, checkIn, checkOut });
  }

  const datesValid = !!checkIn && !!checkOut && checkOut > checkIn;
  const canSearch = destination.trim().length > 0 && datesValid;

  // IATA codes resolve to a real city name for the Airbnb/Vrbo query; a
  // free-typed city name (e.g. "Lisbon") is used as-is.
  const destinationCity = /^[A-Za-z]{3}$/.test(destination.trim())
    ? cityName(destination.trim())
    : destination.trim();

  const airbnbHref = canSearch
    ? trackedRedirect(
        airbnbLink({ destinationCity, checkIn, checkOut, adults }),
        { surface: 'rentals-page', provider: 'airbnb' },
      )
    : null;
  const vrboHref = canSearch
    ? trackedRedirect(
        vrboLink({ destinationCity, checkIn, checkOut, adults }),
        { surface: 'rentals-page', provider: 'vrbo' },
      )
    : null;

  return (
    <div className="space-y-6">
      <FcPageHead
        title="Airbnbs"
        lede="Whole homes, apartments and rooms for the dates you are already flying. Pick a destination, see the neighbourhoods people book, and we open Airbnb with your dates and party already filled in."
        action={<Link href="/hotels" className="ed-btn ed-btn-secondary inline-flex shrink-0">Hotels</Link>}
      />

      {/* Animated worldwide showcase — Search Airbnb on every slide */}
      <DealSlideshow label="Airbnb destinations worldwide" heightClass="">
        {slideDests.map(d => (
          <StayHeroSlide key={d.iata} iata={d.iata} checkIn={d.checkIn} checkOut={d.checkOut} adults={adults} mode="airbnb" />
        ))}
      </DealSlideshow>

      <>
        <form action="/airbnbs" method="get" className="ed-panel space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="ed-label">Destination</span>
              <DestinationSelect
                name="destination"
                value={destination}
                trackedDestinations={trackedDestinations}
                className="ed-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="ed-label">Check-in</span>
              <input type="date" name="checkIn" defaultValue={checkIn} className="ed-input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="ed-label">Check-out</span>
              <input type="date" name="checkOut" defaultValue={checkOut} className="ed-input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="ed-label">Adults</span>
              <input type="number" name="adults" min={1} max={16} defaultValue={adults} className="ed-input" />
            </label>
          </div>
          <button type="submit" className="ed-btn ed-btn-primary">Update search</button>
        </form>

        {canSearch ? (
          <div className="ed-panel flex flex-wrap gap-3">
            <a href={airbnbHref!} target="_blank" rel="noopener sponsored" className="ed-btn ed-btn-primary">
              Search Airbnb →
            </a>
            <a href={vrboHref!} target="_blank" rel="noopener sponsored" className="ed-btn ed-btn-primary">
              Vrbo →
            </a>
          </div>
        ) : (
          <div className="ed-panel">
            <p className="ed-panel-note" style={{ margin: 0 }}>
              Enter a destination and valid check-in / check-out dates (check-out after check-in) to open an Airbnb search.
            </p>
          </div>
        )}
      </>

      {trackedDestinations.length > 1 && (
        <div className="ed-panel">
          <div className="ed-eyebrow">Across your tracked routes</div>
          <h2 className="ed-h2" style={{ marginTop: 4 }}>Airbnbs in every destination you watch</h2>
          <p className="ed-panel-note" style={{ marginBottom: 16 }}>
            One upsell card per distinct destination across your tracked searches. Dates default to each search&rsquo;s outbound/return.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {trackedDestinations.slice(0, 6).map(dest => {
              const s = searches.find(x => x.destination === dest)!;
              return (
                <HotelUpsell
                  key={dest}
                  origin={s.origin}
                  destinationIata={dest}
                  checkIn={s.depart_date}
                  checkOut={s.return_date}
                  adults={s.adults}
                  surface="offers-page"
                  mode="airbnb"
                />
              );
            })}
          </div>
        </div>
      )}

      <p className="ed-panel-note">
        Airbnb and Vrbo searches are plain links prefilled with your dates — no commission. Prices and availability are shown on their sites.
      </p>
    </div>
  );
}

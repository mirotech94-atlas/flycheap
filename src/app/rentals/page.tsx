import Link from 'next/link';
import type { Metadata } from 'next';
import { FcPageHead } from '@/components/fc/PageKit';
import { cityName } from '@/lib/explore';
import { airbnbLink, vrboLink, trackedRedirect } from '@/lib/affiliate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vacation rentals | FlyCheap',
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
function parseDay(value: string | undefined): string {
  return value && ISO_DAY.test(value) ? value : '';
}
function parseAdults(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n : 2;
}

export default async function RentalsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const destination = firstParam(params?.destination) ?? '';
  const checkIn = parseDay(firstParam(params?.checkIn));
  const checkOut = parseDay(firstParam(params?.checkOut));
  const adults = parseAdults(firstParam(params?.adults));

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
        title="Vacation rentals"
        lede="Whole homes, apartments and rooms on Airbnb and Vrbo — often cheaper than a hotel for a longer trip. Pick where you're going and we open the search with your dates and party already filled in."
        action={<Link href="/hotels" className="nc-btn-quiet inline-flex shrink-0">Hotels</Link>}
      />

      <form action="/rentals" method="get" className="card p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-slate-500">Destination</span>
            <input
              type="text"
              name="destination"
              defaultValue={destination}
              placeholder="IATA or city, e.g. CAI or Cairo"
              className="w-full"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-slate-500">Check-in</span>
            <input type="date" name="checkIn" defaultValue={checkIn} className="w-full" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-slate-500">Check-out</span>
            <input type="date" name="checkOut" defaultValue={checkOut} className="w-full" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-slate-500">Adults</span>
            <input type="number" name="adults" min={1} max={16} defaultValue={adults} className="w-full" />
          </label>
        </div>
        <button type="submit" className="btn btn-primary">Update search</button>
      </form>

      {canSearch ? (
        <div className="card p-6 flex flex-wrap gap-3">
          <a href={airbnbHref!} target="_blank" rel="noopener sponsored" className="btn btn-gold">
            Search Airbnb →
          </a>
          <a href={vrboHref!} target="_blank" rel="noopener sponsored" className="btn btn-gold">
            Search Vrbo →
          </a>
        </div>
      ) : (
        <div className="card p-6 text-sm text-slate-500">
          Enter a destination and valid check-in / check-out dates (check-out after check-in) to open a rentals search.
        </div>
      )}

      <p className="text-xs text-slate-500">
        Airbnb and Vrbo searches are plain links prefilled with your dates — no commission. Prices and availability are shown on their sites.
      </p>
    </div>
  );
}

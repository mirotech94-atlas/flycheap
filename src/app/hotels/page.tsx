import { Suspense } from 'react';
import Link from 'next/link';
import { FcPageHead } from '@/components/fc/PageKit';
import { queries } from '@/lib/db';
import { HotelUpsell } from '@/components/HotelUpsell';
import { HotelsBoard } from '@/components/HotelsBoard';
import { DealSlideshow } from '@/components/DealSlideshow';
import { StayHeroSlide } from '@/components/StayHeroSlide';
import { buildShowcaseDestinations } from '@/lib/showcaseDestinations';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HotelsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const todayPlus = (days: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const destination = firstParam(params?.destination) ?? 'CAI';
  const checkIn = firstParam(params?.checkIn) ?? todayPlus(60);
  const checkOut = firstParam(params?.checkOut) ?? todayPlus(67);
  const adults = Number(firstParam(params?.adults) ?? '2') || 2;

  const searches = queries.listSearches();
  const trackedDestinations = Array.from(new Set(searches.map(s => s.destination)));

  // Slideshow destinations: tracked routes first (with their real dates), padded
  // with worldwide popular cities so the showcase is global even with few tracked.
  const slideDests = buildShowcaseDestinations({
    trackedDestinations,
    searches,
    fallbackCheckIn: checkIn,
    fallbackCheckOut: checkOut,
  });

  return (
    <div className="space-y-6">
      <FcPageHead
        title="Somewhere to stay"
        lede="Hotels for the dates you are already flying. Pick a destination, see what a night actually costs there, and we hand you to the provider with the better price. Looking for a whole home? Use Airbnbs."
        action={<Link href="/airbnbs" className="ed-btn ed-btn-secondary inline-flex shrink-0">Airbnbs</Link>}
      />

      {/* Animated worldwide showcase — Book now on every slide */}
      <DealSlideshow label="Hotel destinations worldwide" heightClass="h-[280px] md:h-[320px]">
        {slideDests.map(d => (
          <StayHeroSlide key={d.iata} iata={d.iata} checkIn={d.checkIn} checkOut={d.checkOut} adults={adults} mode="hotel" />
        ))}
      </DealSlideshow>

      <Suspense fallback={<div className="ed-tile-meta">Loading hotel search…</div>}>
        <HotelsBoard
          destinationDefault={destination}
          checkInDefault={checkIn}
          checkOutDefault={checkOut}
          adultsDefault={adults}
          trackedDestinations={trackedDestinations}
        />
      </Suspense>

      {trackedDestinations.length > 1 && (
        <div className="ed-panel">
          <div className="ed-eyebrow">Across your tracked routes</div>
          <h2 className="ed-h2" style={{ marginTop: 4 }}>Hotels in every destination you watch</h2>
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
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

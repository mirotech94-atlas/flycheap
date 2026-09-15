import { Suspense } from 'react';
import { queries } from '@/lib/db';
import { HotelUpsell } from '@/components/HotelUpsell';
import { HotelsBoard } from '@/components/HotelsBoard';
import { DealSlideshow } from '@/components/DealSlideshow';
import { getCityGradient } from '@/lib/cityGradients';
import { cityName } from '@/lib/explore';
import { hotellookLink, trackedRedirect, buildRouteId } from '@/lib/affiliate';

// Worldwide hotel inspiration — used to pad the slideshow beyond tracked routes.
const POPULAR_HOTEL_CITIES = ['DXB', 'PAR', 'BKK', 'CUN', 'ROM', 'IST', 'MLE', 'TYO'];

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
  const slideDests: Array<{ iata: string; checkIn: string; checkOut: string }> = [];
  for (const dest of trackedDestinations.slice(0, 5)) {
    const s = searches.find(x => x.destination === dest)!;
    slideDests.push({ iata: dest, checkIn: s.depart_date, checkOut: s.return_date });
  }
  for (const iata of POPULAR_HOTEL_CITIES) {
    if (slideDests.length >= 8) break;
    if (slideDests.some(d => d.iata === iata)) continue;
    slideDests.push({ iata, checkIn, checkOut });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow mb-1">Where you sleep</div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Hotels</h1>
        <p className="text-sm text-slate-500 mt-1">
          Search hotels, see when each destination is cheapest, and book through your preferred provider.
          Hotel <em>offers</em> generated from your tracked routes also surface on the <a href="/offers" className="underline text-brand">Offers</a> page.
        </p>
      </div>

      {/* Animated worldwide showcase — Book now on every slide */}
      <DealSlideshow label="Hotel destinations worldwide" heightClass="h-[280px] md:h-[320px]">
        {slideDests.map(d => (
          <HotelHeroSlide key={d.iata} iata={d.iata} checkIn={d.checkIn} checkOut={d.checkOut} adults={adults} />
        ))}
      </DealSlideshow>

      <Suspense fallback={<div className="text-xs text-slate-500">Loading hotel search…</div>}>
        <HotelsBoard
          destinationDefault={destination}
          checkInDefault={checkIn}
          checkOutDefault={checkOut}
          adultsDefault={adults}
          trackedDestinations={trackedDestinations}
        />
      </Suspense>

      {trackedDestinations.length > 1 && (
        <div className="card">
          <div className="eyebrow">Across your tracked routes</div>
          <h2 className="!mb-2 mt-1">Hotels in every destination you watch</h2>
          <p className="text-xs text-slate-500 mb-4">
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

/* ─── Full-width hotel hero slide — gradient scene + Book now ─── */
function HotelHeroSlide({ iata, checkIn, checkOut, adults }: {
  iata: string; checkIn: string; checkOut: string; adults: number;
}) {
  const grad = getCityGradient(iata);
  const city = cityName(iata).replace(/\s*\([^)]*\)\s*/g, '').trim();
  const nights = Math.max(1, Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
  ));
  const rid = buildRouteId({ origin: 'HOTEL', destination: iata, departDate: checkIn, returnDate: checkOut, adults });
  const href = trackedRedirect(
    hotellookLink({ destination: iata, checkIn, checkOut, adults, surface: 'hotels-slideshow', routeId: rid }),
    { surface: 'hotels-slideshow', routeId: rid },
  );

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${grad.from} 0%, ${grad.to} 60%, ${grad.from}dd 100%)` }} />
      <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
      <div className="absolute -right-6 top-1/2 -translate-y-1/2 text-[170px] md:text-[220px] font-black text-white/6 font-mono leading-none select-none pointer-events-none">
        {iata}
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />

      <div className="relative h-full flex flex-col justify-center px-8 md:px-14 max-w-2xl">
        <div className="text-white/60 text-xs uppercase tracking-[0.2em] font-semibold mb-1">
          Stay in
        </div>
        <h3 className="text-white font-display font-extrabold text-4xl md:text-5xl tracking-tight leading-none">
          {city}
        </h3>
        <div className="text-white/70 text-sm mt-2">
          {checkIn} → {checkOut} · {nights} night{nights !== 1 ? 's' : ''} · {adults} adult{adults !== 1 ? 's' : ''} · 70+ booking sites compared
        </div>
        <div className="mt-5">
          <a
            href={href}
            target="_blank"
            rel="noopener sponsored"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-[#d4af37] text-[#0a3a6b] hover:bg-[#f0cc50] transition shadow-lg"
          >
            Book now →
          </a>
        </div>
      </div>
    </div>
  );
}

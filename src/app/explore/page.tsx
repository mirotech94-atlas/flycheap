import Link from 'next/link';
import { topDestinations, hotDeals, POPULAR_HOMES, cityName } from '@/lib/explore';
import { fmtUSD, fmtDate } from '@/lib/utils';
import { FlightSearchForm } from '@/components/FlightSearchForm';
import { SatelliteExploreMap } from '@/components/SatelliteExploreMap';
import { ExploreDestinationCard } from '@/components/ExploreDestinationCard';
import { ExploreRankedList, type ExploreOption } from '@/components/ExploreRankedList';
import { DealSlideshow } from '@/components/DealSlideshow';
import { StayHeroSlide } from '@/components/StayHeroSlide';
import { bookingLink } from '@/lib/affiliate';
import { getCityGradient } from '@/lib/cityGradients';
import { placePhoto } from '@/lib/places';
import { queries } from '@/lib/db';
import { buildShowcaseDestinations } from '@/lib/showcaseDestinations';

export const dynamic = 'force-dynamic';
export const revalidate = 600;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const origin = (firstParam(params?.from) ?? 'NYC').toUpperCase();
  const maxBudget = Number(firstParam(params?.maxPrice) ?? '500');

  const [destinations, rawDeals] = await Promise.all([
    topDestinations(origin),
    hotDeals({ origin, maxPrice: maxBudget, limit: 200 }),
  ]);

  // Photo showcase — same destinations/padding as the Hotels page, so the
  // Explore hero never drifts from what Hotels shows.
  const todayPlus = (days: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const searches = queries.listSearches();
  const trackedDestinations = Array.from(new Set(searches.map(s => s.destination)));
  const showcaseDests = buildShowcaseDestinations({
    trackedDestinations,
    searches,
    fallbackCheckIn: todayPlus(60),
    fallbackCheckOut: todayPlus(67),
  });

  const PER_DEST = 3;
  const byDest = new Map<string, typeof rawDeals>();
  for (const d of rawDeals) {
    const arr = byDest.get(d.destination) ?? [];
    if (arr.length < PER_DEST) { arr.push(d); byDest.set(d.destination, arr); }
  }
  const deals = Array.from(byDest.values()).flat()
    .sort((a, b) => a.price - b.price)
    .slice(0, 30);

  const featured = deals.slice(0, 8);
  const rest = deals.slice(8);

  const activeFilter = maxBudget <= 200 ? 'cheapest' : maxBudget >= 2000 ? 'wildcard' : 'trending';

  const originCity = cityName(origin);

  // Ranked "Everywhere" list (Skyscanner pattern) — every fare option the page
  // already fetched, normalised so the client can filter by trip length + month
  // and pick the cheapest per destination. No extra provider calls.
  const nightsOf = (dep: string, ret: string | null): number | null => {
    if (!ret) return null;
    const a = Date.parse(dep.slice(0, 10) + 'T00:00:00Z');
    const b = Date.parse(ret.slice(0, 10) + 'T00:00:00Z');
    return Number.isNaN(a) || Number.isNaN(b) || b <= a ? null : Math.round((b - a) / 86400000);
  };
  const today = new Date().toISOString().slice(0, 10);
  const rankedOptions: ExploreOption[] = [
    ...rawDeals.map(d => {
      const dep = (d.depart_date ?? '').slice(0, 10) || today;
      const ret = d.return_date ? d.return_date.slice(0, 10) : null;
      return { destination: d.destination, city: cityName(d.destination), price: d.price, depart: dep, ret, nights: nightsOf(dep, ret), stops: d.number_of_changes ?? null };
    }),
    ...destinations.map(d => {
      const dep = (d.departure_at ?? '').slice(0, 10) || today;
      const ret = d.return_at ? d.return_at.slice(0, 10) : null;
      return { destination: d.destination, city: cityName(d.destination), price: d.price, depart: dep, ret, nights: nightsOf(dep, ret), stops: d.transfers, airline: d.airline };
    }),
  ].filter(o => o.price > 0);

  return (
    <div className="space-y-8">
      {/* Animated worldwide showcase — real destination photos, same
          destinations/padding logic as the Hotels page slideshow. */}
      <DealSlideshow label="Explore destinations worldwide" heightClass="h-[280px] md:h-[320px]">
        {showcaseDests.map(d => (
          <StayHeroSlide key={d.iata} iata={d.iata} checkIn={d.checkIn} checkOut={d.checkOut} adults={1} mode="explore" />
        ))}
      </DealSlideshow>

      {/* HERO — the destination board. Dark cabin deck; the search is the
          one bright thing on it, because searching is why anyone is here. */}
      <section
        className="relative rounded-2xl border overflow-hidden"
        style={{ zIndex: 50, background: 'var(--nc-dark)', borderColor: 'var(--nc-rule)' }}
      >
        <div className="relative px-6 md:px-10 py-9 md:py-12">
          <h1
            className="text-[clamp(2rem,4.4vw,3rem)] leading-[1.04] tracking-[-0.025em]"
            style={{ fontFamily: 'var(--nc-display)', fontWeight: 700, color: 'var(--nc-on-dark)' }}
          >
            Where can you afford to go?
          </h1>
          <p className="mt-3 max-w-[54ch] text-[14.5px] leading-relaxed" style={{ color: 'var(--nc-on-dark-mute)' }}>
            Set a home airport and a budget. We show you every destination that fits it today,
            cheapest first — then watch whichever one you pick.
          </p>

          <div className="mt-6">
            <FlightSearchForm initialOrigin={origin} initialMaxPrice={maxBudget} />
          </div>

          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <span className="text-[12px] mr-1" style={{ color: 'var(--nc-on-dark-faint)' }}>Flying from</span>
            {POPULAR_HOMES.map(c => {
              const on = origin === c.code;
              return (
                <Link
                  key={c.code}
                  href={`/explore?from=${c.code}`}
                  className="px-3 py-1.5 rounded-full text-[12.5px] font-medium transition"
                  style={on
                    ? { background: 'var(--nc-amber)', color: '#241703' }
                    : { background: 'var(--nc-deck-2)', color: 'var(--nc-on-dark)', border: '1px solid var(--nc-rule)' }}
                >
                  <span className="mr-1.5">{c.emoji}</span>
                  <span className="nc-code" style={{ fontSize: '12px' }}>{c.code}</span>
                  <span className="ml-1.5" style={{ opacity: 0.8 }}>{c.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* TRUST SIGNALS — Kayak-style compact strip */}
      <section className="grid sm:grid-cols-3 gap-3 motion-fade-in">
        {([
          {
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            ),
            title: '1,000+ airlines tracked',
            sub: 'Aviasales global network, refreshed continuously',
          },
          {
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            ),
            title: 'Live fares, updated continuously',
            sub: 'Real pricing · not stale estimates',
          },
          {
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ),
            title: 'No booking fees · book direct',
            sub: 'We route you to the cheapest OTA · no markup',
          },
        ] as const).map((t, i) => (
          <div key={i} className="flex items-center gap-3 py-3 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
              {t.icon}
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{t.title}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{t.sub}</div>
            </div>
          </div>
        ))}
      </section>

      {/* QUICK FILTER CHIPS */}
      <section className="motion-slide-up motion-delay-1 grid sm:grid-cols-3 gap-3">
        {([
          { id: 'trending', href: `/explore?from=${origin}`, eyebrowCls: 'text-emerald-700', title: 'Most-searched routes', desc: `The fares moving fastest from ${originCity} right now.`, label: 'Trending now' },
          { id: 'cheapest', href: `/explore?from=${origin}&maxPrice=200`, eyebrowCls: 'text-brand-700', title: 'Anywhere under $200', desc: 'Rock-bottom round-trips visible in cache today.', label: 'Cheapest right now' },
          { id: 'wildcard', href: `/explore?from=${origin}&maxPrice=2000`, eyebrowCls: 'text-amber-700', title: 'Surprise me', desc: 'Open the budget wide — anywhere reachable on Earth.', label: 'Wildcard' },
        ] as const).map(c => {
          const isActive = activeFilter === c.id;
          return (
            <Link
              key={c.id}
              href={c.href}
              className={`card hover:!shadow-lift hover:-translate-y-0.5 transition-all relative ${isActive ? 'ring-2 ring-[#d4af37] !border-[#d4af37]/60' : ''}`}
            >
              <div className={`eyebrow ${c.eyebrowCls} flex items-center gap-1.5`}>
                {c.label}
                {isActive && <span className="text-[10px] text-[#d4af37]">● active</span>}
              </div>
              <div className="font-display font-bold text-lg mt-1">{c.title}</div>
              <p className="text-xs text-slate-500 mt-1">{c.desc}</p>
            </Link>
          );
        })}
      </section>

      {/* HOT DEALS — Kayak-style photo carousel */}
      <section className="motion-slide-up motion-delay-1">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="eyebrow text-emerald-700">Cheapest fares</div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              From {originCity} · under {fmtUSD(maxBudget)}
            </h2>
          </div>
          <div className="text-xs text-slate-500">{deals.length} deals · live cache</div>
        </div>

        {featured.length === 0 ? (
          <div className="card text-sm text-slate-500 text-center py-12">
            No deals cached for {originCity} under {fmtUSD(maxBudget)}.{' '}
            <Link href={`/explore?from=${origin}&maxPrice=2000`} className="text-brand-700 underline">Try a higher budget</Link>{' '}
            or pick a different home city above.
          </div>
        ) : (
          <DealSlideshow label={`Cheapest fares from ${originCity}`}>
            {featured.map((d, i) => (
              <HeroDealSlide key={`${d.destination}-${d.depart_date}-${i}`} deal={d} originCity={originCity} />
            ))}
          </DealSlideshow>
        )}

        {rest.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
              Show {rest.length} more deals
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {rest.map((d, i) => (
                <SimpleCard key={`r-${d.destination}-${d.depart_date}-${i}`} deal={d} />
              ))}
            </div>
          </details>
        )}
      </section>

      {/* EVERYWHERE — ranked list (Skyscanner pattern) with list / map toggle */}
      {(deals.length > 0 || destinations.length > 0) && (
        <section className="motion-slide-up motion-delay-2">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="eyebrow text-brand-700">Everywhere · ranked by price</div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Where can {fmtUSD(maxBudget)} take you from {originCity}?
              </h2>
            </div>
            <div className="text-xs text-slate-500">filter by trip length &amp; month · toggle the map</div>
          </div>
          <ExploreRankedList
            origin={origin}
            originCity={originCity}
            options={rankedOptions}
            mapSlot={
              <SatelliteExploreMap
                defaultOrigin={origin}
                deals={(() => {
                  const m = new Map<string, { origin: string; destination: string; price: number; depart_date: string; return_date: string | null }>();
                  for (const d of deals) {
                    const dep = (d.depart_date ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);
                    m.set(d.destination, { origin: d.origin, destination: d.destination, price: d.price, depart_date: dep, return_date: d.return_date ? d.return_date.slice(0, 10) : null });
                  }
                  for (const d of destinations) {
                    if (m.has(d.destination)) continue;
                    m.set(d.destination, { origin, destination: d.destination, price: d.price, depart_date: (d.departure_at ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10), return_date: d.return_at ? d.return_at.slice(0, 10) : null });
                  }
                  return Array.from(m.values());
                })()}
              />
            }
          />
        </section>
      )}

      {/* TOP DESTINATIONS */}
      <section className="motion-slide-up motion-delay-2">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="eyebrow text-brand-700">Where can you fly?</div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Top destinations from {originCity}
            </h2>
          </div>
          <div className="text-xs text-slate-500">{destinations.length} routes · cheapest first</div>
        </div>

        {destinations.length === 0 ? (
          <div className="card text-sm text-slate-500 text-center py-12">
            No routes cached for {origin}. Try a major hub like{' '}
            {['NYC', 'LON', 'DXB', 'TYO'].map((c, i) => (
              <span key={c}>{i > 0 ? ', ' : ''}<Link href={`/explore?from=${c}`} className="text-brand-700 underline">{c}</Link></span>
            ))}.
          </div>
        ) : (
          <>
            {/* Animated hero slideshow — top 8 destinations */}
            <DealSlideshow label={`Top destinations from ${originCity}`} heightClass="h-[300px] md:h-[340px]">
              {destinations.slice(0, 8).map(dest => (
                <HeroDestinationSlide
                  key={dest.destination}
                  origin={origin}
                  originCity={originCity}
                  destination={dest.destination}
                  destinationName={cityName(dest.destination)}
                  price={dest.price}
                  departAt={dest.departure_at ?? null}
                  returnAt={dest.return_at ?? null}
                />
              ))}
            </DealSlideshow>

            {/* Full grid below for scanning all routes */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-5">
              {destinations.slice(0, 20).map((dest, i) => (
                <ExploreDestinationCard
                  key={dest.destination}
                  origin={origin}
                  destination={dest.destination}
                  destinationName={cityName(dest.destination)}
                  price={dest.price}
                  departAt={dest.departure_at ?? null}
                  returnAt={dest.return_at ?? null}
                  index={i}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* MARKETING FOOTER */}
      <section className="motion-slide-up motion-delay-3 grid md:grid-cols-3 gap-4">
        <div className="card">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center mb-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-700">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <h3 className="font-display font-bold text-base">1,000+ airlines tracked</h3>
          <p className="text-xs text-slate-500 mt-1">Legacy carriers, low-cost and regional, priced from the Aviasales network and refreshed continuously.</p>
        </div>
        <div className="card">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center mb-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-700">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <h3 className="font-display font-bold text-base">Lowest visible fare</h3>
          <p className="text-xs text-slate-500 mt-1">No hidden markups — we route you to the OTA quoting the lowest price: Aviasales, Google Flights, or direct.</p>
        </div>
        <Link href="/settings#alerts" className="card hover:!shadow-lift hover:-translate-y-0.5 transition-all">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center mb-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-700">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <h3 className="font-display font-bold text-base">Smart price alerts</h3>
          <p className="text-xs text-slate-500 mt-1">Set a target price; get an alert when any tracked route drops below. Weekly mover digest every Sunday.</p>
          <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-brand-700 mt-2">Configure alerts →</div>
        </Link>
      </section>
    </div>
  );
}

/* ─── Full-width hero slide — used in the featured deals slideshow ─── */
function HeroDealSlide({ deal, originCity }: { deal: DealRow; originCity: string }) {
  const dep = deal.depart_date.slice(0, 10);
  const ret = deal.return_date ? deal.return_date.slice(0, 10) : dep;
  const nights = deal.return_date
    ? Math.round((new Date(ret).getTime() - new Date(dep).getTime()) / 86400000)
    : null;
  const grad = getCityGradient(deal.destination);
  const isDeal = deal.price < 200;
  const city = cityName(deal.destination);
  const photo = placePhoto(deal.destination);

  const href = bookingLink({
    origin: deal.origin,
    destination: deal.destination,
    departDate: dep,
    returnDate: ret,
    adults: 1,
    infants: 0,
    trackAs: { perAdult: Math.round(deal.price), provider: 'aviasales', surface: 'explore-slideshow' },
  });

  return (
    <div className="relative w-full h-full overflow-hidden">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={city} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          {/* Gradient scene */}
          <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${grad.from} 0%, ${grad.to} 60%, ${grad.from}dd 100%)` }} />
          <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
          {/* Giant IATA watermark */}
          <div className="absolute -right-6 top-1/2 -translate-y-1/2 text-[200px] md:text-[260px] font-black text-white/6 font-mono leading-none select-none pointer-events-none">
            {deal.destination}
          </div>
        </>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />

      {/* Content */}
      <div className="relative h-full flex flex-col justify-center px-8 md:px-14 max-w-2xl">
        <div className="flex gap-2 mb-3">
          {deal.number_of_changes === 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/90 text-white px-2.5 py-1 rounded-full">Nonstop</span>
          )}
          {isDeal && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-[#d4af37] text-[#0a3a6b] px-2.5 py-1 rounded-full">Deal</span>
          )}
          {deal.number_of_changes > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white px-2.5 py-1 rounded-full">
              {deal.number_of_changes} stop{deal.number_of_changes > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="text-white/60 text-xs uppercase tracking-[0.2em] font-semibold mb-1">
          {originCity} → {city}
        </div>
        <h3 className="text-white font-display font-extrabold text-4xl md:text-5xl tracking-tight leading-none">
          {city}
        </h3>
        <div className="text-white/70 text-sm mt-2">
          {fmtDate(dep)} → {fmtDate(ret)}{nights !== null ? ` · ${nights} nights` : ''} · round-trip
        </div>
        <div className="flex items-end gap-4 mt-5">
          <div>
            <div className="text-white/55 text-[10px] uppercase tracking-wider">from</div>
            <div className="text-[#d4af37] font-black text-4xl tabular leading-none">{fmtUSD(deal.price)}</div>
          </div>
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

/* ─── Full-width destination slide — used in the top-destinations slideshow ─── */
function HeroDestinationSlide({
  origin, originCity, destination, destinationName, price, departAt, returnAt,
}: {
  origin: string; originCity: string; destination: string; destinationName: string;
  price: number; departAt: string | null; returnAt: string | null;
}) {
  const grad = getCityGradient(destination);
  const photo = placePhoto(destination);
  const dep = (departAt ?? '').slice(0, 10) || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const ret = (returnAt ?? '').slice(0, 10) || new Date(new Date(dep).getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const href = bookingLink({
    origin, destination, departDate: dep, returnDate: ret, adults: 1, infants: 0,
    trackAs: { perAdult: Math.round(price), provider: 'aviasales', surface: 'explore-destinations-slideshow' },
  });

  return (
    <div className="relative w-full h-full overflow-hidden">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={destinationName} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${grad.from} 0%, ${grad.to} 60%, ${grad.from}dd 100%)` }} />
          <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
          <div className="absolute -right-6 top-1/2 -translate-y-1/2 text-[180px] md:text-[230px] font-black text-white/6 font-mono leading-none select-none pointer-events-none">
            {destination}
          </div>
        </>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />

      <div className="relative h-full flex flex-col justify-center px-8 md:px-14 max-w-2xl">
        <div className="text-white/60 text-xs uppercase tracking-[0.2em] font-semibold mb-1">
          {originCity} → {destinationName}
        </div>
        <h3 className="text-white font-display font-extrabold text-4xl md:text-5xl tracking-tight leading-none">
          {destinationName}
        </h3>
        <div className="text-white/70 text-sm mt-2">
          {fmtDate(dep)} → {fmtDate(ret)} · cheapest cached round-trip
        </div>
        <div className="flex items-end gap-4 mt-5">
          <div>
            <div className="text-white/55 text-[10px] uppercase tracking-wider">from</div>
            <div className="text-[#d4af37] font-black text-4xl tabular leading-none">{fmtUSD(price)}</div>
          </div>
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

/* ─── Gradient photo card (Kayak-style) — used in the featured carousel ─── */
type DealRow = {
  origin: string;
  destination: string;
  price: number;
  depart_date: string;
  return_date: string | null;
  number_of_changes: number;
};

/* ─── Simple compact card — used in the "Show more" grid ─── */
function SimpleCard({ deal }: { deal: DealRow }) {
  const dep = deal.depart_date.slice(0, 10);
  const ret = deal.return_date ? deal.return_date.slice(0, 10) : dep;
  const href = bookingLink({
    origin: deal.origin,
    destination: deal.destination,
    departDate: dep,
    returnDate: ret,
    adults: 1,
    infants: 0,
    trackAs: { perAdult: Math.round(deal.price), provider: 'aviasales', surface: 'explore-page' },
  });
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener sponsored"
      className="card !p-3 relative overflow-hidden hover:!shadow-lift hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-400">
          {deal.origin} → {deal.destination}
        </div>
        {deal.number_of_changes === 0 ? (
          <span className="badge badge-ok text-[9px]">nonstop</span>
        ) : (
          <span className="badge badge-muted text-[9px]">{deal.number_of_changes} stop{deal.number_of_changes > 1 ? 's' : ''}</span>
        )}
      </div>
      <div className="font-display font-bold text-base text-slate-900 dark:text-white truncate mt-1">
        {cityName(deal.destination)}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-bold tabular text-emerald-700 dark:text-emerald-400 text-lg">{fmtUSD(deal.price)}</span>
        <span className="text-xs text-slate-500">round-trip</span>
      </div>
      <div className="text-[11px] text-slate-500 mt-1">
        {fmtDate(dep)}{ret !== dep && ` → ${fmtDate(ret)}`}
      </div>
    </a>
  );
}

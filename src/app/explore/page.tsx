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
    <div className="ed-explore">
      {/* Animated worldwide showcase — real destination photos, same
          destinations/padding logic as the Hotels page slideshow. */}
      <section>
        <DealSlideshow label="Explore destinations worldwide" heightClass="h-[280px] md:h-[320px]">
          {showcaseDests.map(d => (
            <StayHeroSlide key={d.iata} iata={d.iata} checkIn={d.checkIn} checkOut={d.checkOut} adults={1} mode="explore" />
          ))}
        </DealSlideshow>
      </section>

      {/* HERO — header + the destination board's search. No eyebrow line: the
          original hero had none above its <h1>, and this page has no i18n
          dict to source a new label from (rule 8 — no new English literals;
          "Explore" already exists verbatim as StayHeroSlide's eyebrow copy,
          but that's a different element, not this one). */}
      <section>
        <h1 className="ed-h1">Where can you afford to go?</h1>
        <p className="ed-sub">
          Set a home airport and a budget. We show you every destination that fits it today,
          cheapest first — then watch whichever one you pick.
        </p>

        <div style={{ marginBottom: 20 }}>
          <FlightSearchForm initialOrigin={origin} initialMaxPrice={maxBudget} />
        </div>

        <div className="ed-actions" style={{ alignItems: 'center' }}>
          <span className="ed-mono" style={{ color: 'var(--muted-2)', marginRight: 2 }}>Flying from</span>
          {POPULAR_HOMES.map(c => {
            const on = origin === c.code;
            return (
              <Link
                key={c.code}
                href={`/explore?from=${c.code}`}
                className={`ed-btn ${on ? 'ed-btn-primary' : 'ed-btn-secondary'}`}
              >
                <span>{c.emoji}</span>
                <span className="ed-mono">{c.code}</span>
                <span style={{ opacity: 0.8 }}>{c.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* TRUST SIGNALS */}
      <section>
        <div className="ed-tiles">
          {([
            {
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              ),
              title: '1,000+ airlines tracked',
              sub: 'Aviasales global network, refreshed continuously',
            },
            {
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              ),
              title: 'Live fares, updated continuously',
              sub: 'Real pricing · not stale estimates',
            },
            {
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ),
              title: 'No booking fees · book direct',
              sub: 'We route you to the cheapest OTA · no markup',
            },
          ] as const).map((t, i) => (
            <div key={i} className="ed-tile" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 0 }}>
              <div style={{ color: 'var(--green)', flexShrink: 0 }}>{t.icon}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>{t.title}</div>
                <div className="ed-tile-meta">{t.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* QUICK FILTER CHIPS */}
      <section>
        <div className="ed-tiles">
          {([
            { id: 'trending', href: `/explore?from=${origin}`, title: 'Most-searched routes', desc: `The fares moving fastest from ${originCity} right now.`, label: 'Trending now' },
            { id: 'cheapest', href: `/explore?from=${origin}&maxPrice=200`, title: 'Anywhere under $200', desc: 'Rock-bottom round-trips visible in cache today.', label: 'Cheapest right now' },
            { id: 'wildcard', href: `/explore?from=${origin}&maxPrice=2000`, title: 'Surprise me', desc: 'Open the budget wide — anywhere reachable on Earth.', label: 'Wildcard' },
          ] as const).map(c => {
            const isActive = activeFilter === c.id;
            return (
              <Link
                key={c.id}
                href={c.href}
                className={`ed-tile${isActive ? ' active' : ''}`}
              >
                <div className="ed-tile-kicker" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.label}
                  {isActive && <span className="ed-dot" style={{ background: 'var(--accent)' }} />}
                </div>
                <div className="ed-tile-value" style={{ fontSize: 18 }}>{c.title}</div>
                <p className="ed-tile-meta">{c.desc}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* HOT DEALS — photo slideshow of the cheapest fares */}
      <section>
        <div className="ed-eyebrow">Cheapest fares</div>
        <h2 className="ed-h2">From {originCity} · under {fmtUSD(maxBudget)}</h2>
        <p className="ed-sub" style={{ marginBottom: 20 }}>{deals.length} deals · live cache</p>

        {featured.length === 0 ? (
          <div style={{ border: '1px solid var(--rule)', padding: '48px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            No deals cached for {originCity} under {fmtUSD(maxBudget)}.{' '}
            <Link href={`/explore?from=${origin}&maxPrice=2000`} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Try a higher budget</Link>{' '}
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
          <details style={{ marginTop: 16 }}>
            <summary className="ed-mono" style={{ cursor: 'pointer', color: 'var(--muted)' }}>
              Show {rest.length} more deals
            </summary>
            <div className="ed-tiles" style={{ marginTop: 12 }}>
              {rest.map((d, i) => (
                <SimpleCard key={`r-${d.destination}-${d.depart_date}-${i}`} deal={d} />
              ))}
            </div>
          </details>
        )}
      </section>

      {/* EVERYWHERE — ranked list (Skyscanner pattern) with list / map toggle */}
      {(deals.length > 0 || destinations.length > 0) && (
        <section>
          <div className="ed-eyebrow">Everywhere · ranked by price</div>
          <h2 className="ed-h2">Where can {fmtUSD(maxBudget)} take you from {originCity}?</h2>
          <p className="ed-sub" style={{ marginBottom: 20 }}>filter by trip length &amp; month · toggle the map</p>
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
      <section>
        <div className="ed-eyebrow">Where can you fly?</div>
        <h2 className="ed-h2">Top destinations from {originCity}</h2>
        <p className="ed-sub" style={{ marginBottom: 20 }}>{destinations.length} routes · cheapest first</p>

        {destinations.length === 0 ? (
          <div style={{ border: '1px solid var(--rule)', padding: '48px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            No routes cached for {origin}. Try a major hub like{' '}
            {['NYC', 'LON', 'DXB', 'TYO'].map((c, i) => (
              <span key={c}>{i > 0 ? ', ' : ''}<Link href={`/explore?from=${c}`} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{c}</Link></span>
            ))}.
          </div>
        ) : (
          <>
            {/* Photo slideshow — top 8 destinations */}
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

            {/* Full tile grid below for scanning all routes */}
            <div className="ed-tiles" style={{ marginTop: 20 }}>
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
      <section>
        <div className="ed-tiles">
          <div className="ed-tile">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}>
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <h3 className="ed-tile-value" style={{ fontSize: 16 }}>1,000+ airlines tracked</h3>
            <p className="ed-tile-meta">Legacy carriers, low-cost and regional, priced from the Aviasales network and refreshed continuously.</p>
          </div>
          <div className="ed-tile">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}>
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            <h3 className="ed-tile-value" style={{ fontSize: 16 }}>Lowest visible fare</h3>
            <p className="ed-tile-meta">No hidden markups — we route you to the OTA quoting the lowest price: Aviasales, Google Flights, or direct.</p>
          </div>
          <Link href="/settings#alerts" className="ed-tile">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <h3 className="ed-tile-value" style={{ fontSize: 16 }}>Smart price alerts</h3>
            <p className="ed-tile-meta">Set a target price; get an alert when any tracked route drops below. Weekly mover digest every Sunday.</p>
            <div className="ed-mono" style={{ color: 'var(--accent)', marginTop: 'auto' }}>Configure alerts →</div>
          </Link>
        </div>
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
    <div className="ed-photo-hero">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={city} className="ed-photo-hero-img" />
      ) : (
        <div className="ed-photo-hero-fallback">
          <span className="ed-photo-hero-fallback-code">{deal.destination}</span>
        </div>
      )}

      <div className="ed-photo-hero-band">
        <div className="ed-photo-hero-tags">
          {deal.number_of_changes === 0 && (
            <span className="ed-photo-hero-tag"><span className="ed-dot" /> Nonstop</span>
          )}
          {isDeal && (
            <span className="ed-photo-hero-tag deal"><span className="ed-dot amber" /> Deal</span>
          )}
          {deal.number_of_changes > 0 && (
            <span className="ed-photo-hero-tag">{deal.number_of_changes} stop{deal.number_of_changes > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="ed-photo-hero-eyebrow">{originCity} → {city}</div>
        <h3 className="ed-photo-hero-title">{city}</h3>
        <div className="ed-photo-hero-meta">
          {fmtDate(dep)} → {fmtDate(ret)}{nights !== null ? ` · ${nights} nights` : ''} · round-trip
        </div>
        <div className="ed-photo-hero-foot">
          <div>
            <div className="ed-photo-hero-price-label">from</div>
            <div className="ed-photo-hero-price">{fmtUSD(deal.price)}</div>
          </div>
          <a href={href} target="_blank" rel="noopener sponsored" className="ed-btn ed-btn-primary ed-btn-hero">
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
  const photo = placePhoto(destination);
  const dep = (departAt ?? '').slice(0, 10) || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const ret = (returnAt ?? '').slice(0, 10) || new Date(new Date(dep).getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const href = bookingLink({
    origin, destination, departDate: dep, returnDate: ret, adults: 1, infants: 0,
    trackAs: { perAdult: Math.round(price), provider: 'aviasales', surface: 'explore-destinations-slideshow' },
  });

  return (
    <div className="ed-photo-hero">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={destinationName} className="ed-photo-hero-img" />
      ) : (
        <div className="ed-photo-hero-fallback">
          <span className="ed-photo-hero-fallback-code">{destination}</span>
        </div>
      )}

      <div className="ed-photo-hero-band">
        <div className="ed-photo-hero-eyebrow">{originCity} → {destinationName}</div>
        <h3 className="ed-photo-hero-title">{destinationName}</h3>
        <div className="ed-photo-hero-meta">
          {fmtDate(dep)} → {fmtDate(ret)} · cheapest cached round-trip
        </div>
        <div className="ed-photo-hero-foot">
          <div>
            <div className="ed-photo-hero-price-label">from</div>
            <div className="ed-photo-hero-price">{fmtUSD(price)}</div>
          </div>
          <a href={href} target="_blank" rel="noopener sponsored" className="ed-btn ed-btn-primary ed-btn-hero">
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

/* ─── Simple compact tile — used in the "Show more" grid ─── */
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
    <a href={href} target="_blank" rel="noopener sponsored" className="ed-tile motion-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div className="ed-tile-kicker">{deal.origin} → {deal.destination}</div>
        {deal.number_of_changes === 0 ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="ed-dot" /><span className="ed-tile-meta">nonstop</span></span>
        ) : (
          <span className="ed-tile-meta">{deal.number_of_changes} stop{deal.number_of_changes > 1 ? 's' : ''}</span>
        )}
      </div>
      <div className="ed-tile-value" style={{ fontSize: 16 }}>{cityName(deal.destination)}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono-ed)', fontWeight: 600, fontSize: 17, color: 'var(--ink)' }}>{fmtUSD(deal.price)}</span>
        <span className="ed-tile-meta">round-trip</span>
      </div>
      <div className="ed-tile-meta">
        {fmtDate(dep)}{ret !== dep && ` → ${fmtDate(ret)}`}
      </div>
    </a>
  );
}

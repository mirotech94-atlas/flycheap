import Link from 'next/link';
import { topDestinations, hotDeals, POPULAR_HOMES, cityName } from '@/lib/explore';
import { fmtUSD, fmtDate } from '@/lib/utils';
import { ExploreSearchBar } from '@/components/ExploreSearchBar';
import { WorldMap } from '@/components/WorldMap';

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

  const [destinations, deals] = await Promise.all([
    topDestinations(origin),
    hotDeals({ origin, maxPrice: maxBudget, limit: 30 }),
  ]);

  const featured = deals.slice(0, 6);
  const rest = deals.slice(6);

  return (
    <div className="space-y-8">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/60 dark:border-slate-700/60 bg-brand-gradient text-white motion-fade-in">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-gold/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-brand-400/30 blur-3xl pointer-events-none" />
        <div className="relative px-6 md:px-10 py-10 md:py-14">
          <div className="eyebrow !text-white/70">Discover · worldwide</div>
          <h1 className="font-display font-extrabold text-3xl md:text-5xl tracking-tight mt-2">
            Cheapest flights, <span className="text-brand-gold">anywhere on Earth</span>
          </h1>
          <p className="text-white/80 mt-3 max-w-xl text-sm md:text-base">
            Live pricing from Aviasales' global network, refreshed continuously. Set a home airport and a budget;
            we'll surface the cheapest deals to every reachable destination.
          </p>

          <div className="mt-6">
            <ExploreSearchBar initialOrigin={origin} initialMaxPrice={maxBudget} />
          </div>

          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-white/60 mr-1">Popular:</span>
            {POPULAR_HOMES.map(c => (
              <Link
                key={c.code}
                href={`/explore?from=${c.code}`}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${origin === c.code ? 'bg-brand-gold text-brand-900' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                <span className="mr-1">{c.emoji}</span>{c.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* HOT DEALS GRID */}
      <section className="motion-slide-up motion-delay-1">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="eyebrow text-emerald-700">Trending now</div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Cheap deals from {cityName(origin)} · ≤ {fmtUSD(maxBudget)}
            </h2>
          </div>
          <div className="text-xs text-slate-500">{deals.length} deals · live cache</div>
        </div>

        {featured.length === 0 ? (
          <div className="card text-sm text-slate-500 text-center py-12">
            No deals cached for {cityName(origin)} under {fmtUSD(maxBudget)}. Try a higher budget or a different home city.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.map((d, i) => (
              <DealCard key={`${d.destination}-${d.depart_date}-${i}`} deal={d} index={i} />
            ))}
          </div>
        )}

        {rest.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700">
              Show {rest.length} more deals
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {rest.map((d, i) => (
                <DealCard key={`r-${d.destination}-${d.depart_date}-${i}`} deal={d} index={i} compact />
              ))}
            </div>
          </details>
        )}
      </section>

      {/* WORLD MAP */}
      {destinations.length > 0 && (
        <section className="motion-slide-up motion-delay-2">
          <WorldMap origin={origin} destinations={destinations.map(d => ({ destination: d.destination, price: d.price, departure_at: d.departure_at }))} />
        </section>
      )}

      {/* TOP DESTINATIONS BY PRICE */}
      <section className="motion-slide-up motion-delay-2">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="eyebrow text-brand-700">Where can you fly?</div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Top destinations from {cityName(origin)}
            </h2>
          </div>
          <div className="text-xs text-slate-500">{destinations.length} routes · cheapest first</div>
        </div>

        {destinations.length === 0 ? (
          <div className="card text-sm text-slate-500 text-center py-12">
            No directions cached for {origin}. Try a major hub like NYC, LON, DXB, TYO.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {destinations.slice(0, 20).map((dest, i) => (
              <Link
                key={dest.destination}
                href={`/explore?from=${origin}&to=${dest.destination}`}
                className="card !p-3 hover:!shadow-lift hover:-translate-y-0.5 transition-all motion-fade-in"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-400">
                  {dest.destination}
                </div>
                <div className="font-display font-bold text-base mt-0.5 text-slate-900 dark:text-white truncate">
                  {cityName(dest.destination)}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-lg font-bold tabular text-emerald-700 dark:text-emerald-400">
                    {fmtUSD(dest.price)}
                  </span>
                  <span className="text-[10px] text-slate-500">from</span>
                </div>
                {dest.departure_at && (
                  <div className="text-[10px] text-slate-500 mt-1 truncate">
                    {fmtDate(dest.departure_at.slice(0, 10))}
                    {dest.return_at && ` → ${fmtDate(dest.return_at.slice(0, 10))}`}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* MARKETING FOOTER STRIP */}
      <section className="motion-slide-up motion-delay-3 grid md:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-2xl">🌍</div>
          <h3 className="font-display font-bold text-base mt-2">700+ airlines tracked</h3>
          <p className="text-xs text-slate-500 mt-1">Including legacy carriers, low-cost, and regional. Pricing refreshed continuously by 100M+ daily searches across the network.</p>
        </div>
        <div className="card">
          <div className="text-2xl">💸</div>
          <h3 className="font-display font-bold text-base mt-2">Lowest visible fare</h3>
          <p className="text-xs text-slate-500 mt-1">No hidden markups — we route you to the OTA quoting the lowest price (Aviasales, Kayak, Google Flights, EgyptAir direct).</p>
        </div>
        <div className="card">
          <div className="text-2xl">🔔</div>
          <h3 className="font-display font-bold text-base mt-2">Smart alerts</h3>
          <p className="text-xs text-slate-500 mt-1">Set a target price; get an email when any tracked route drops below. Weekly mover summary every Sunday.</p>
        </div>
      </section>
    </div>
  );
}

function DealCard({ deal, index, compact = false }: { deal: { origin: string; destination: string; price: number; depart_date: string; return_date: string | null; number_of_changes: number }; index: number; compact?: boolean }) {
  return (
    <a
      href={`/offers?origin=${deal.origin}&destination=${deal.destination}&departDate=${deal.depart_date.slice(0,10)}${deal.return_date ? `&returnDate=${deal.return_date.slice(0,10)}` : ''}&adults=1&infants=0`}
      className={`card relative overflow-hidden hover:!shadow-lift hover:-translate-y-1 transition-all motion-fade-in ${compact ? '!p-3' : ''}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand/5 blur-2xl pointer-events-none" />
      <div className="relative">
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
        <div className={`font-display font-bold text-slate-900 dark:text-white truncate mt-1 ${compact ? 'text-base' : 'text-lg'}`}>
          {cityName(deal.destination)}
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className={`font-bold tabular text-emerald-700 dark:text-emerald-400 ${compact ? 'text-xl' : 'text-2xl'}`}>
            {fmtUSD(deal.price)}
          </span>
          <span className="text-xs text-slate-500">round-trip</span>
        </div>
        <div className="text-[11px] text-slate-500 mt-2">
          {fmtDate(deal.depart_date.slice(0, 10))}
          {deal.return_date && ` → ${fmtDate(deal.return_date.slice(0, 10))}`}
        </div>
      </div>
    </a>
  );
}

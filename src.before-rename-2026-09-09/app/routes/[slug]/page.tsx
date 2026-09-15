import Link from 'next/link';
import { notFound } from 'next/navigation';
import { queries } from '@/lib/db';
import { getCachedBestDeals } from '@/lib/bestDeals';
import { airportByCode } from '@/lib/airports';
import { destinationByIata } from '@/data/destinations';
import { fmtUSD } from '@/lib/utils';

export const dynamic = 'force-static';
export const revalidate = 3600;     // page is regenerated hourly with fresh cached deals

type RouteParams = { params: Promise<{ slug: string }> };

/** Parse "jfk-cai" → { origin: "JFK", destination: "CAI" }. Returns null on
 *  any malformed input so the route 404s cleanly instead of crashing. */
function parseSlug(slug: string): { origin: string; destination: string } | null {
  const m = slug.toLowerCase().match(/^([a-z]{3})-([a-z]{3})$/);
  if (!m) return null;
  return { origin: m[1].toUpperCase(), destination: m[2].toUpperCase() };
}

/** Build the list of slugs we want pre-rendered. Pulls from best_deals_cache
 *  so we generate a static page for every route we have real data for. */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const rows = (queries as any).distinctRoutesInCache?.() as
      | Array<{ origin: string; destination: string }>
      | undefined;
    if (rows && rows.length > 0) {
      return rows.map(r => ({ slug: `${r.origin}-${r.destination}`.toLowerCase() }));
    }
  } catch {}
  // Hard-coded fallback so the build never produces zero pages.
  const ORIGINS = ['JFK', 'EWR'];
  const DESTS = ['CAI', 'LHR', 'CDG', 'IST', 'DXB', 'BKK', 'NRT', 'FCO', 'BCN', 'GRU'];
  return ORIGINS.flatMap(o => DESTS.map(d => ({ slug: `${o}-${d}`.toLowerCase() })));
}

export async function generateMetadata({ params }: RouteParams) {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) return { title: 'Route not found — FlyCheap Tracker' };
  const oA = airportByCode(parsed.origin);
  const dA = airportByCode(parsed.destination);
  if (!oA || !dA) return { title: 'Route not found — FlyCheap Tracker' };
  const title = `Cheap flights ${parsed.origin} → ${parsed.destination} (${oA.city} to ${dA.city}) — fare tracker`;
  const desc = `Live fare tracking for ${oA.city} (${parsed.origin}) to ${dA.city} (${parsed.destination}). Best cached prices, when to book, and direct booking links.`;
  return {
    title,
    description: desc,
    alternates: { canonical: `https://flycheap.18dn.com/routes/${slug.toLowerCase()}` },
    openGraph: { title, description: desc, type: 'website' },
  };
}

export default async function RoutePage({ params }: RouteParams) {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) notFound();

  const origin = airportByCode(parsed!.origin);
  const destination = airportByCode(parsed!.destination);
  if (!origin || !destination) notFound();

  // Deals for the destination — filter client-side to origin so EWR and JFK
  // route pages don’t cross-contaminate each other.
  const { deals: allDeals, refreshed_at } = getCachedBestDeals(50, destination!.iata);
  const deals = allDeals.filter(d => d.origin === origin!.iata).slice(0, 8);
  const cheapest = deals[0]?.per_adult_usd ?? null;

  const guide = destinationByIata(destination!.iata);

  // AI-generated route guide (route storyteller). Present only for seeded
  // routes; the hand-written "About this route" blurb is the fallback.
  const aiContent = queries.getRouteContent(origin!.iata, destination!.iata);
  const aiFaqs: Array<{ q: string; a: string }> = (() => {
    if (!aiContent) return [];
    try { return JSON.parse(aiContent.faqs_json); } catch { return []; }
  })();

  // Cheapest month from cached deals — surfaces the "best time to book"
  // signal that the dashboard already computes elsewhere. If we have no
  // data, hide the section rather than show a wrong answer.
  const cheapestMonth = (() => {
    if (deals.length === 0) return null;
    const byMonth = new Map<string, number>();
    for (const d of deals) {
      const m = (d.outbound_date ?? '').slice(0, 7);
      if (!m) continue;
      const cur = byMonth.get(m);
      if (cur === undefined || d.per_adult_usd < cur) byMonth.set(m, d.per_adult_usd);
    }
    if (byMonth.size === 0) return null;
    const sorted = [...byMonth.entries()].sort((a, b) => a[1] - b[1]);
    const [month, price] = sorted[0];
    return { month, price };
  })();

  // Structured data — Schema.org Flight + BreadcrumbList. Helps Google
  // surface us in flight-search rich results and travel widgets.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Flight',
        flightNumber: 'Various',
        airline: { '@type': 'Airline', name: 'Multiple carriers' },
        departureAirport: {
          '@type': 'Airport',
          iataCode: origin!.iata,
          name: origin!.name,
          address: { '@type': 'PostalAddress', addressLocality: origin!.city, addressCountry: origin!.country },
        },
        arrivalAirport: {
          '@type': 'Airport',
          iataCode: destination!.iata,
          name: destination!.name,
          address: { '@type': 'PostalAddress', addressLocality: destination!.city, addressCountry: destination!.country },
        },
        ...(cheapest != null ? {
          offers: { '@type': 'Offer', priceCurrency: 'USD', price: cheapest, availability: 'https://schema.org/InStock' },
        } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Routes', item: 'https://flycheap.18dn.com/routes' },
          { '@type': 'ListItem', position: 2, name: `${origin!.iata} → ${destination!.iata}`, item: `https://flycheap.18dn.com/routes/${slug.toLowerCase()}` },
        ],
      },
      ...(aiFaqs.length > 0 ? [{
        '@type': 'FAQPage',
        mainEntity: aiFaqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      }] : []),
    ],
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto motion-fade-in">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* HERO */}
      <div>
        <nav className="text-xs text-slate-500 mb-2">
          <Link href="/routes" className="hover:underline">Routes</Link>
          {' / '}
          <span>{origin!.iata} → {destination!.iata}</span>
        </nav>
        <div className="eyebrow mb-1">Route tracker</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight font-display">
          Cheap flights <span className="whitespace-nowrap">{origin!.iata} → {destination!.iata}</span>
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-300 mt-2">
          {origin!.city}, {origin!.country} to {destination!.city}, {destination!.country}.
        </p>
        {refreshed_at && (
          <p className="text-xs text-slate-400 mt-2">Cache last refreshed {new Date(refreshed_at).toISOString().slice(0, 16).replace('T', ' ')} UTC.</p>
        )}
      </div>

      {/* KEY STATS */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="eyebrow">Cheapest cached</div>
          <div className="text-2xl font-bold">{cheapest != null ? fmtUSD(cheapest) : '—'}</div>
          <div className="text-xs text-slate-500 mt-1">per adult, round-trip</div>
        </div>
        <div className="card">
          <div className="eyebrow">Deals tracked</div>
          <div className="text-2xl font-bold">{deals.length}</div>
          <div className="text-xs text-slate-500 mt-1">on this exact route</div>
        </div>
        <div className="card">
          <div className="eyebrow">Best month</div>
          <div className="text-2xl font-bold">{cheapestMonth ? cheapestMonth.month : '—'}</div>
          <div className="text-xs text-slate-500 mt-1">{cheapestMonth ? `from ${fmtUSD(cheapestMonth.price)}` : 'add tracking to discover'}</div>
        </div>
      </section>

      {/* DEALS TABLE */}
      {deals.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-3">Current cheapest dates</h2>
          <div className="overflow-x-auto">
            <table className="fmt w-full">
              <thead>
                <tr>
                  <th>Depart</th>
                  <th>Return</th>
                  <th>Stops out / back</th>
                  <th className="text-right">Per adult</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d, i) => (
                  <tr key={i}>
                    <td>{d.outbound_date}</td>
                    <td>{d.return_date}</td>
                    <td>{d.outbound_transfers} / {d.return_transfers}</td>
                    <td className="text-right font-mono">{fmtUSD(d.per_adult_usd)}</td>
                    <td className="text-right">
                      <Link
                        href={`/offers?origin=${origin!.iata}&destination=${destination!.iata}&depart=${d.outbound_date}&return=${d.return_date}&adults=2&surface=routes-page&route_id=${origin!.iata}-${destination!.iata}-${d.outbound_date}-${d.return_date}`}
                        className="text-xs underline decoration-dotted text-blue-700 dark:text-blue-400"
                      >
                        Search →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* WHEN TO FLY (AI, grounded in route DNA) */}
      {aiContent && (
        <section>
          <h2 className="text-xl font-semibold mb-3">When to fly</h2>
          <div className="space-y-3 text-slate-700 dark:text-slate-300 leading-relaxed">
            {aiContent.when_to_fly_md.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para.replace(/^#+\s*/, '')}</p>
            ))}
          </div>
        </section>
      )}

      {/* FAQ (AI, grounded) */}
      {aiFaqs.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-3">Frequently asked</h2>
          <div className="space-y-4">
            {aiFaqs.map((f, i) => (
              <div key={i}>
                <h3 className="font-semibold text-slate-900 dark:text-white">{f.q}</h3>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed mt-1">{f.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ROUTE BACKGROUND — hand-written fallback (always shown; complements AI) */}
      <section>
        <h2 className="text-xl font-semibold mb-3">About this route</h2>
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          {origin!.iata} → {destination!.iata} connects {origin!.name} in {origin!.city}, {origin!.country}, to {destination!.name} in {destination!.city}, {destination!.country}.
          {origin!.iata === 'JFK' && destination!.iata === 'CAI' && ' EgyptAir operates the only scheduled nonstop on this route, typically five days a week on a Boeing 777-300ER.'}
          {origin!.iata === 'EWR' && destination!.iata === 'CAI' && ' No carrier flies this route nonstop — every itinerary connects, most commonly through Frankfurt, Istanbul, or Paris.'}
          {origin!.iata === 'JFK' && destination!.iata === 'NRT' && ' ANA, JAL, and United fly nonstop from JFK to Tokyo Narita; flight time runs about 14 hours eastbound.'}
          {origin!.iata === 'JFK' && destination!.iata === 'LHR' && ' One of the most competitive transatlantic markets in the world — six US carriers plus British Airways and Virgin Atlantic share the route.'}
          {origin!.iata === 'JFK' && destination!.iata === 'CDG' && ' Air France, Delta, United, and La Compagnie all run nonstops, with up to eight daily departures in summer.'}
          {' '}Fare data here is polled hourly from Travelpayouts and refreshed multiple times per day.
        </p>
      </section>

      {/* DESTINATION GUIDE LINK */}
      {guide && (
        <section className="card bg-slate-50 dark:bg-slate-900/50">
          <div className="eyebrow text-emerald-700 dark:text-emerald-400">Trip planning</div>
          <h2 className="text-lg font-semibold mt-1 mb-2">Going to {guide.city}?</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            {guide.tagline} Visa rules, currency, best months, and what to see —
          </p>
          <Link
            href={`/destinations/${guide.iata.toLowerCase()}`}
            className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Read the {guide.city} travel guide →
          </Link>
        </section>
      )}

      <p className="text-xs text-slate-400 pt-4 border-t border-slate-200 dark:border-slate-800">
        Prices shown are cached from our Travelpayouts feed and represent recent lowest fares; actual prices at booking time may differ.
        Booking links route through our affiliate redirector — we may earn a small commission at no extra cost to you.
      </p>
    </div>
  );
}

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
  if (!parsed) return { title: 'Route not found — FlyCheap' };
  const oA = airportByCode(parsed.origin);
  const dA = airportByCode(parsed.destination);
  if (!oA || !dA) return { title: 'Route not found — FlyCheap' };
  const title = `Cheap flights ${parsed.origin} → ${parsed.destination} (${oA.city} to ${dA.city}) — fare tracker`;
  const desc = `Live fare tracking for ${oA.city} (${parsed.origin}) to ${dA.city} (${parsed.destination}). Best cached prices, when to book, and direct booking links.`;
  return {
    title,
    description: desc,
    alternates: { canonical: `https://flycheap.live/routes/${slug.toLowerCase()}` },
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
          { '@type': 'ListItem', position: 1, name: 'Routes', item: 'https://flycheap.live/routes' },
          { '@type': 'ListItem', position: 2, name: `${origin!.iata} → ${destination!.iata}`, item: `https://flycheap.live/routes/${slug.toLowerCase()}` },
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
    <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* HERO */}
      <div>
        <nav style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          <Link href="/routes" style={{ color: 'var(--muted)' }}>Routes</Link>
          {' / '}
          <span>{origin!.iata} → {destination!.iata}</span>
        </nav>
        <div className="ed-eyebrow">Route tracker</div>
        <h1 className="ed-h1">
          Cheap flights <span style={{ whiteSpace: 'nowrap' }}>{origin!.iata} → {destination!.iata}</span>
        </h1>
        <p className="ed-sub">
          {origin!.city}, {origin!.country} to {destination!.city}, {destination!.country}.
        </p>
        {refreshed_at && (
          <p className="ed-panel-note" style={{ marginTop: -12, marginBottom: 20 }}>Cache last refreshed {new Date(refreshed_at).toISOString().slice(0, 16).replace('T', ' ')} UTC.</p>
        )}
      </div>

      {/* KEY STATS */}
      <section className="ed-stats">
        <div className="ed-stat">
          <div className="ed-stat-label">Cheapest cached</div>
          <div className="ed-stat-value ed-fare-text">{cheapest != null ? fmtUSD(cheapest) : '—'}</div>
          <div className="ed-stat-note">per adult, round-trip</div>
        </div>
        <div className="ed-stat">
          <div className="ed-stat-label">Deals tracked</div>
          <div className="ed-stat-value">{deals.length}</div>
          <div className="ed-stat-note">on this exact route</div>
        </div>
        <div className="ed-stat">
          <div className="ed-stat-label">Best month</div>
          <div className="ed-stat-value">{cheapestMonth ? cheapestMonth.month : '—'}</div>
          <div className="ed-stat-note">{cheapestMonth ? `from ${fmtUSD(cheapestMonth.price)}` : 'add tracking to discover'}</div>
        </div>
      </section>

      {/* DEALS TABLE */}
      {deals.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2 className="ed-h2">Current cheapest dates</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="ed-table">
              <thead>
                <tr>
                  <th>Depart</th>
                  <th>Return</th>
                  <th>Stops out / back</th>
                  <th className="num">Per adult</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d, i) => (
                  <tr key={i}>
                    <td>{d.outbound_date}</td>
                    <td>{d.return_date}</td>
                    <td>{d.outbound_transfers} / {d.return_transfers}</td>
                    <td className="num">{fmtUSD(d.per_adult_usd)}</td>
                    <td className="cta">
                      <Link
                        href={`/offers?origin=${origin!.iata}&destination=${destination!.iata}&depart=${d.outbound_date}&return=${d.return_date}&adults=2&surface=routes-page&route_id=${origin!.iata}-${destination!.iata}-${d.outbound_date}-${d.return_date}`}
                        className="ed-btn ed-btn-tile"
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
        <section style={{ marginBottom: 36 }}>
          <h2 className="ed-h2">When to fly</h2>
          <div style={{ color: 'var(--ink-soft)', lineHeight: 1.6 }}>
            {aiContent.when_to_fly_md.split(/\n{2,}/).map((para, i) => (
              <p key={i} style={{ margin: '0 0 12px' }}>{para.replace(/^#+\s*/, '')}</p>
            ))}
          </div>
        </section>
      )}

      {/* FAQ (AI, grounded) */}
      {aiFaqs.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2 className="ed-h2">Frequently asked</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {aiFaqs.map((f, i) => (
              <div key={i}>
                <h3 style={{ fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{f.q}</h3>
                <p style={{ color: 'var(--ink-soft)', lineHeight: 1.6, margin: '4px 0 0' }}>{f.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ROUTE BACKGROUND — hand-written fallback (always shown; complements AI) */}
      <section style={{ marginBottom: 36 }}>
        <h2 className="ed-h2">About this route</h2>
        <p style={{ color: 'var(--ink-soft)', lineHeight: 1.6 }}>
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
        <section className="ed-panel" style={{ marginBottom: 36 }}>
          <div className="ed-eyebrow">Trip planning</div>
          <h2 className="ed-h2" style={{ marginTop: 6 }}>Going to {guide.city}?</h2>
          <p className="ed-panel-note" style={{ marginBottom: 14 }}>
            {guide.tagline} Visa rules, currency, best months, and what to see —
          </p>
          <Link href={`/destinations/${guide.iata.toLowerCase()}`} className="ed-btn ed-btn-secondary">
            Read the {guide.city} travel guide →
          </Link>
        </section>
      )}

      <p className="ed-panel-note" style={{ paddingTop: 16, borderTop: '1px solid var(--rule)' }}>
        Prices shown are cached from our Travelpayouts feed and represent recent lowest fares; actual prices at booking time may differ.
        Booking links route through our affiliate redirector — we may earn a small commission at no extra cost to you.
      </p>
    </div>
  );
}

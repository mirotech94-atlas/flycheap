import Link from 'next/link';
import { notFound } from 'next/navigation';
import { destinationBySlug, DESTINATIONS } from '@/data/destinations';
import { getCachedBestDeals } from '@/lib/bestDeals';
import { airportByCode } from '@/lib/airports';
import { fmtUSD } from '@/lib/utils';

export const dynamic = 'force-static';
export const revalidate = 3600;

type DestinationParams = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return DESTINATIONS.map(d => ({ slug: d.iata.toLowerCase() }));
}

export async function generateMetadata({ params }: DestinationParams) {
  const { slug } = await params;
  const guide = destinationBySlug(slug);
  if (!guide) return { title: 'Destination not found — FlyCheap' };
  return {
    title: guide.seoTitle,
    description: guide.metaDescription,
    alternates: { canonical: `https://flycheap.18dn.com/destinations/${guide.iata.toLowerCase()}` },
    openGraph: { title: guide.seoTitle, description: guide.metaDescription, type: 'article' },
  };
}

export default async function DestinationPage({ params }: DestinationParams) {
  const { slug } = await params;
  const guide = destinationBySlug(slug);
  if (!guide) notFound();

  // Pull the cheapest cached deals to this destination (across all origins).
  const { deals } = getCachedBestDeals(20, guide!.iata);
  const top5 = deals.slice(0, 5);

  // JSON-LD: Article + BreadcrumbList. Article markup helps the page index as
  // editorial content (Skyscanner's reviewer concern) rather than a thin tool.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: guide!.seoTitle,
        description: guide!.metaDescription,
        about: { '@type': 'Place', name: guide!.city, address: { '@type': 'PostalAddress', addressLocality: guide!.city, addressCountry: guide!.country } },
        author: { '@type': 'Organization', name: 'FlyCheap' },
        publisher: { '@type': 'Organization', name: 'FlyCheap' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Destinations', item: 'https://flycheap.18dn.com/destinations' },
          { '@type': 'ListItem', position: 2, name: guide!.city, item: `https://flycheap.18dn.com/destinations/${guide!.iata.toLowerCase()}` },
        ],
      },
    ],
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto motion-fade-in">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div>
        <nav className="text-xs text-slate-500 mb-2">
          <Link href="/destinations" className="hover:underline">Destinations</Link>
          {' / '}
          <span>{guide!.city}</span>
        </nav>
        <div className="eyebrow mb-1">Destination guide</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight font-display">
          {guide!.city}, {guide!.country}
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-300 mt-2">{guide!.tagline}</p>
      </div>

      {/* Quick facts strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {guide!.quickFacts.map(f => (
          <div key={f.label} className="card">
            <div className="eyebrow">{f.label}</div>
            <div className="text-sm mt-1">{f.value}</div>
          </div>
        ))}
      </section>

      {/* Long-form guide sections */}
      <article className="prose prose-slate dark:prose-invert max-w-none">
        {guide!.sections.map(s => (
          <section key={s.heading} className="mt-6">
            <h2 className="text-xl font-semibold !mb-2">{s.heading}</h2>
            <p className="leading-relaxed text-slate-700 dark:text-slate-300">{s.body}</p>
          </section>
        ))}
      </article>

      {/* Live deals to this destination */}
      {top5.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-3">Current cheapest flights to {guide!.city}</h2>
          <div className="overflow-x-auto">
            <table className="fmt w-full">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Depart</th>
                  <th>Return</th>
                  <th className="text-right">Per adult</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {top5.map((d, i) => {
                  const oA = airportByCode(d.origin);
                  return (
                    <tr key={i}>
                      <td>{d.origin} <span className="text-slate-400 text-xs">({oA?.city ?? '—'})</span></td>
                      <td>{d.outbound_date}</td>
                      <td>{d.return_date}</td>
                      <td className="text-right font-mono">{fmtUSD(d.per_adult_usd)}</td>
                      <td className="text-right">
                        <Link
                          href={`/routes/${d.origin.toLowerCase()}-${guide!.iata.toLowerCase()}`}
                          className="text-xs underline decoration-dotted text-blue-700 dark:text-blue-400"
                        >
                          Track →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-slate-400 pt-4 border-t border-slate-200 dark:border-slate-800">
        Guide last reviewed by our editorial team. Prices are cached and refresh hourly from our Travelpayouts feed.
      </p>
    </div>
  );
}

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
    alternates: { canonical: `https://flycheap.live/destinations/${guide.iata.toLowerCase()}` },
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
          { '@type': 'ListItem', position: 1, name: 'Destinations', item: 'https://flycheap.live/destinations' },
          { '@type': 'ListItem', position: 2, name: guide!.city, item: `https://flycheap.live/destinations/${guide!.iata.toLowerCase()}` },
        ],
      },
    ],
  };

  return (
    <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div>
        <nav style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          <Link href="/destinations" style={{ color: 'var(--muted)' }}>Destinations</Link>
          {' / '}
          <span>{guide!.city}</span>
        </nav>
        <div className="ed-eyebrow">Destination guide</div>
        <h1 className="ed-h1">
          {guide!.city}, {guide!.country}
        </h1>
        <p className="ed-sub">{guide!.tagline}</p>
      </div>

      {/* Quick facts strip */}
      <section className="ed-stats">
        {guide!.quickFacts.map(f => (
          <div key={f.label} className="ed-stat">
            <div className="ed-stat-label">{f.label}</div>
            <div className="ed-stat-value" style={{ fontSize: 18 }}>{f.value}</div>
          </div>
        ))}
      </section>

      {/* Long-form guide sections */}
      <article>
        {guide!.sections.map(s => (
          <section key={s.heading} style={{ marginBottom: 28 }}>
            <h2 className="ed-h2">{s.heading}</h2>
            <p style={{ color: 'var(--ink-soft)', lineHeight: 1.6 }}>{s.body}</p>
          </section>
        ))}
      </article>

      {/* Live deals to this destination */}
      {top5.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2 className="ed-h2">Current cheapest flights to {guide!.city}</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="ed-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Depart</th>
                  <th>Return</th>
                  <th className="num">Per adult</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {top5.map((d, i) => {
                  const oA = airportByCode(d.origin);
                  return (
                    <tr key={i}>
                      <td>{d.origin} <span style={{ color: 'var(--muted)', fontSize: 12 }}>({oA?.city ?? '—'})</span></td>
                      <td>{d.outbound_date}</td>
                      <td>{d.return_date}</td>
                      <td className="num">{fmtUSD(d.per_adult_usd)}</td>
                      <td className="cta">
                        <Link
                          href={`/routes/${d.origin.toLowerCase()}-${guide!.iata.toLowerCase()}`}
                          className="ed-btn ed-btn-tile"
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

      <p className="ed-panel-note" style={{ paddingTop: 16, borderTop: '1px solid var(--rule)' }}>
        Guide last reviewed by our editorial team. Prices are cached and refresh hourly from our Travelpayouts feed.
      </p>
    </div>
  );
}

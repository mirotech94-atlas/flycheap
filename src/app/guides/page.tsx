import Link from 'next/link';
import { GUIDES } from '@/data/guides';
import { FcPageHead } from '@/components/fc/PageKit';

export const dynamic = 'force-static';
export const revalidate = 86400;

export const metadata = {
  title: 'Travel & flight booking guides — FlyCheap',
  description: 'Practical, data-backed guides on when to book cheap flights, NYC airport comparisons, and getting the best fares to specific destinations.',
  alternates: { canonical: 'https://flycheap.live/guides' },
};

// One category tag per guide article — editorial, not destination-keyed.
// Cycled by index (no `category`/`region` field exists on GuideArticle yet).
const GUIDE_TAGS: string[] = [
  'Booking strategy',
  'Airport comparison',
  'Route guide',
  'Price intelligence',
  'Travel tips',
];

export default function GuidesIndexPage() {
  const sorted = [...GUIDES].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return (
    <div>
      <FcPageHead
        title="How to find cheap flights"
        lede={`Field notes from our own fare polling — when to book, which airports win, and the mistakes that quietly cost money. ${sorted.length} guide${sorted.length === 1 ? '' : 's'}, no sponsored placements.`}
      />

      {/* GUIDE CARDS — tile grid */}
      <section>
        <div className="ed-eyebrow" style={{ marginBottom: 12 }}>All guides · {sorted.length} articles</div>
        <div className="ed-tiles">
          {sorted.map((g, i) => {
            const tag = GUIDE_TAGS[i % GUIDE_TAGS.length];
            return (
              <Link key={g.slug} href={`/guides/${g.slug}`} className="ed-tile">
                <div className="ed-tile-kicker">{tag}</div>
                <div className="ed-tile-value" style={{ fontSize: 18 }}>{g.title}</div>
                <p className="ed-tile-meta">{g.dek}</p>
                <div className="ed-tile-meta">
                  {g.readMinutes} min read · {g.publishedAt}
                </div>
                <span className="ed-btn ed-btn-tile">
                  Read guide{' '}
                  <span>→</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Trust strip */}
      <section
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          columnGap: 32, rowGap: 8, padding: '16px 0',
          borderTop: '1px solid var(--rule)', marginTop: 32,
        }}
      >
        {[
          'Written from fares we recorded ourselves',
          'Every number traced to a fare we logged',
          'No sponsored placements — editorial only',
        ].map(t => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--green)', flexShrink: 0 }}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {t}
          </div>
        ))}
      </section>
    </div>
  );
}

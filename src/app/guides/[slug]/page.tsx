import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guideBySlug, GUIDES } from '@/data/guides';

export const dynamic = 'force-static';
export const revalidate = 86400;

type GuideParams = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return GUIDES.map(g => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: GuideParams) {
  const { slug } = await params;
  const g = guideBySlug(slug);
  if (!g) return { title: 'Guide not found — FlyCheap' };
  return {
    title: g.seoTitle || g.title,
    description: g.metaDescription,
    alternates: { canonical: `https://flycheap.live/guides/${g.slug}` },
    openGraph: { title: g.seoTitle || g.title, description: g.metaDescription, type: 'article' },
  };
}

// Render a paragraph that may contain **bold** markdown. Simple regex split —
// guides.ts authors are us, so we don't need a full markdown engine.
function renderParagraph(text: string, key: number) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p key={key} style={{ color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: 16 }}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </p>
  );
}

export default async function GuidePage({ params }: GuideParams) {
  const { slug } = await params;
  const g = guideBySlug(slug);
  if (!g) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: g!.title,
        description: g!.metaDescription,
        datePublished: g!.publishedAt,
        dateModified: g!.updatedAt ?? g!.publishedAt,
        author: { '@type': 'Organization', name: 'FlyCheap' },
        publisher: { '@type': 'Organization', name: 'FlyCheap' },
        wordCount: g!.sections.reduce((s, sec) => s + sec.paragraphs.join(' ').split(/\s+/).length, 0),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Guides', item: 'https://flycheap.live/guides' },
          { '@type': 'ListItem', position: 2, name: g!.title, item: `https://flycheap.live/guides/${g!.slug}` },
        ],
      },
    ],
  };

  return (
    <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div>
        <nav style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          <Link href="/guides" style={{ color: 'var(--muted)' }}>Guides</Link>
          {' / '}
          <span>{g!.title}</span>
        </nav>
        <div className="ed-eyebrow">Guide · {g!.readMinutes} min read</div>
        <h1 className="ed-h1">{g!.title}</h1>
        <p className="ed-sub">{g!.dek}</p>
        <p className="ed-panel-note" style={{ marginTop: -6 }}>Published {g!.publishedAt}{g!.updatedAt && g!.updatedAt !== g!.publishedAt ? ` · Updated ${g!.updatedAt}` : ''}</p>
      </div>

      <article>
        {g!.sections.map((s, i) => (
          <section key={i} style={{ marginTop: 32 }}>
            <h2 className="ed-h2" style={{ marginBottom: 12 }}>{s.heading}</h2>
            {s.paragraphs.map((p, j) => renderParagraph(p, j))}
          </section>
        ))}
      </article>

      <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 24, marginTop: 48 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: '0 0 10px' }}>More from our team</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {GUIDES.filter(other => other.slug !== g!.slug).slice(0, 3).map(other => (
            <Link key={other.slug} href={`/guides/${other.slug}`} style={{ fontSize: 13, color: 'var(--accent)' }}>
              → {other.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

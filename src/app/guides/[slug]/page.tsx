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
    alternates: { canonical: `https://flycheap.18dn.com/guides/${g.slug}` },
    openGraph: { title: g.seoTitle || g.title, description: g.metaDescription, type: 'article' },
  };
}

// Render a paragraph that may contain **bold** markdown. Simple regex split —
// guides.ts authors are us, so we don't need a full markdown engine.
function renderParagraph(text: string, key: number) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p key={key} className="leading-relaxed text-slate-700 dark:text-slate-300 mb-4">
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
          { '@type': 'ListItem', position: 1, name: 'Guides', item: 'https://flycheap.18dn.com/guides' },
          { '@type': 'ListItem', position: 2, name: g!.title, item: `https://flycheap.18dn.com/guides/${g!.slug}` },
        ],
      },
    ],
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto motion-fade-in">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div>
        <nav className="text-xs text-slate-500 mb-2">
          <Link href="/guides" className="hover:underline">Guides</Link>
          {' / '}
          <span>{g!.title}</span>
        </nav>
        <div className="eyebrow mb-1">Guide · {g!.readMinutes} min read</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight font-display">{g!.title}</h1>
        <p className="text-lg text-slate-600 dark:text-slate-300 mt-2">{g!.dek}</p>
        <p className="text-xs text-slate-400 mt-3">Published {g!.publishedAt}{g!.updatedAt && g!.updatedAt !== g!.publishedAt ? ` · Updated ${g!.updatedAt}` : ''}</p>
      </div>

      <article className="prose prose-slate dark:prose-invert max-w-none">
        {g!.sections.map((s, i) => (
          <section key={i} className="mt-8">
            <h2 className="text-xl font-semibold !mb-3">{s.heading}</h2>
            {s.paragraphs.map((p, j) => renderParagraph(p, j))}
          </section>
        ))}
      </article>

      <div className="border-t border-slate-200 dark:border-slate-800 pt-6 mt-12 space-y-3">
        <p className="text-sm font-semibold">More from our team</p>
        <div className="space-y-2">
          {GUIDES.filter(other => other.slug !== g!.slug).slice(0, 3).map(other => (
            <Link key={other.slug} href={`/guides/${other.slug}`} className="block text-sm text-blue-700 dark:text-blue-400 hover:underline">
              → {other.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

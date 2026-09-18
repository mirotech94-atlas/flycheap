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

// One unique gradient per guide article — editorial, not destination-keyed
const GUIDE_THEMES: Array<{ from: string; to: string; tag: string }> = [
  { from: '#5a0a0a', to: '#8b2a1a', tag: 'Booking strategy' },
  { from: '#0a0a3a', to: '#1a2a6b', tag: 'Airport comparison' },
  { from: '#5a3a0a', to: '#8b5a1a', tag: 'Route guide' },
  { from: '#1a0a5a', to: '#3a1a8b', tag: 'Price intelligence' },
  { from: '#0a3a1a', to: '#1a6b3a', tag: 'Travel tips' },
];

export default function GuidesIndexPage() {
  const sorted = [...GUIDES].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return (
    <div className="space-y-8 motion-fade-in">
      <FcPageHead
        title="How to find cheap flights"
        lede={`Field notes from our own fare polling — when to book, which airports win, and the mistakes that quietly cost money. ${sorted.length} guide${sorted.length === 1 ? '' : 's'}, no sponsored placements.`}
      />

      {/* GUIDE CARDS — Kayak-style inspiration grid */}
      <section>
        <div className="eyebrow text-brand-700 mb-3">All guides · {sorted.length} articles</div>
        <div className="grid md:grid-cols-3 gap-5">
          {sorted.map((g, i) => {
            const theme = GUIDE_THEMES[i % GUIDE_THEMES.length];
            return (
              <Link
                key={g.slug}
                href={`/guides/${g.slug}`}
                className="group relative overflow-hidden rounded-2xl flex flex-col justify-end min-h-[240px] hover:-translate-y-1.5 hover:shadow-2xl transition-all duration-300 motion-fade-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {/* Gradient background */}
                <div
                  className="absolute inset-0"
                  style={{ background: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 65%, ${theme.from}dd 100%)` }}
                />
                {/* Dot texture */}
                <div
                  className="absolute inset-0 opacity-[0.04]"
                  style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '18px 18px' }}
                />
                {/* Article number watermark */}
                <div className="absolute -top-1 -right-2 text-[80px] font-black text-white/7 font-mono leading-none select-none pointer-events-none">
                  {String(i + 1).padStart(2, '0')}
                </div>
                {/* Bottom overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                {/* Badges */}
                <div className="absolute top-4 left-4 flex gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-white/15 text-white px-2 py-0.5 rounded-full">
                    {g.readMinutes} min read
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-[#d4af37]/90 text-[#0a3a6b] px-2 py-0.5 rounded-full">
                    {theme.tag}
                  </span>
                </div>

                {/* Content */}
                <div className="relative p-5 pt-14">
                  <div className="text-white/50 text-[10px] uppercase tracking-[0.15em] font-semibold mb-1">
                    {g.publishedAt}
                  </div>
                  <h2 className="text-white font-bold text-lg font-display leading-snug group-hover:text-brand-gold transition-colors">
                    {g.title}
                  </h2>
                  <p className="text-white/60 text-xs mt-1.5 leading-relaxed line-clamp-2">
                    {g.dek}
                  </p>
                  <div className="mt-3 text-white/45 text-[10px] group-hover:text-white/90 transition flex items-center gap-1 uppercase tracking-wider font-semibold">
                    Read guide{' '}
                    <span className="group-hover:translate-x-0.5 transition-transform inline-block">→</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Trust strip */}
      <section className="flex flex-wrap items-center gap-x-8 gap-y-2 py-4 border-t border-slate-200 dark:border-slate-800">
        {[
          'Written from fares we recorded ourselves',
          'Every number traced to a fare we logged',
          'No sponsored placements — editorial only',
        ].map(t => (
          <div key={t} className="flex items-center gap-2 text-sm text-slate-500">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {t}
          </div>
        ))}
      </section>
    </div>
  );
}

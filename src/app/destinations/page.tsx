import Link from 'next/link';
import { DESTINATIONS } from '@/data/destinations';

export const dynamic = 'force-static';
export const revalidate = 86400;

export const metadata = {
  title: 'Destination guides — FlyCheap',
  description: 'Travel guides for the destinations we track cheap flights to. When to go, visa rules, money, and what to see.',
  alternates: { canonical: 'https://flycheap.live/destinations' },
};

export default function DestinationsIndexPage() {
  return (
    <div className="space-y-8 max-w-3xl mx-auto motion-fade-in">
      <div>
        <div className="eyebrow mb-1">Destination guides</div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight font-display">Where we&apos;ll save you money</h1>
        <p className="text-lg text-slate-600 dark:text-slate-300 mt-2">
          Every destination we actively poll has a guide below — visa, currency, when to go, and what to actually do once you land.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {DESTINATIONS.map(d => (
          <Link
            key={d.iata}
            href={`/destinations/${d.iata.toLowerCase()}`}
            className="card hover:border-emerald-300 transition-colors"
          >
            <div className="flex items-baseline justify-between mb-1">
              <div className="font-semibold text-lg">{d.city}</div>
              <div className="text-xs text-slate-400 font-mono">{d.iata}</div>
            </div>
            <div className="text-xs text-slate-500 mb-2">{d.country}</div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">{d.tagline}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

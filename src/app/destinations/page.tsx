import Link from 'next/link';
import { DESTINATIONS } from '@/data/destinations';
import { FcPageHead } from '@/components/fc/PageKit';

export const dynamic = 'force-static';
export const revalidate = 86400;

export const metadata = {
  title: 'Destination guides — FlyCheap',
  description: 'Travel guides for the destinations we track cheap flights to. When to go, visa rules, money, and what to see.',
  alternates: { canonical: 'https://flycheap.live/destinations' },
};

export default function DestinationsIndexPage() {
  return (
    <div>
      <div className="ed-eyebrow">Destination guides</div>
      <FcPageHead
        title="Where we'll save you money"
        lede="Every destination we actively poll has a guide below — visa, currency, when to go, and what to actually do once you land."
      />

      <div className="ed-tiles">
        {DESTINATIONS.map(d => (
          <Link key={d.iata} href={`/destinations/${d.iata.toLowerCase()}`} className="ed-tile">
            <div className="ed-tile-kicker">{d.iata} · {d.country}</div>
            <div className="ed-tile-value" style={{ fontSize: 18 }}>{d.city}</div>
            <p className="ed-tile-meta">{d.tagline}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

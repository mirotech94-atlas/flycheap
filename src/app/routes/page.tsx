import Link from 'next/link';
import { queries } from '@/lib/db';
import { airportByCode } from '@/lib/airports';
import { fmtUSD } from '@/lib/utils';
import { FcPageHead, FcPanel } from '@/components/fc/PageKit';

export const dynamic = 'force-static';
export const revalidate = 3600;

export const metadata = {
  title: 'All tracked flight routes — FlyCheap',
  description: 'Live cheap-flight tracking for routes from New York (JFK/EWR) to destinations worldwide. Real prices, refreshed hourly.',
  alternates: { canonical: 'https://flycheap.live/routes' },
};

function distinctRoutes(): Array<{ origin: string; destination: string; deals: number; min_usd: number }> {
  try {
    const rows = (queries as any).distinctRoutesInCache?.() as
      | Array<{ origin: string; destination: string; deals: number; min_usd: number }>
      | undefined;
    if (rows && rows.length > 0) return rows;
  } catch {}
  return [];
}

export default function RoutesIndexPage() {
  const routes = distinctRoutes();
  const grouped = new Map<string, typeof routes>();
  for (const r of routes) {
    if (!grouped.has(r.destination)) grouped.set(r.destination, []);
    grouped.get(r.destination)!.push(r);
  }
  const sortedDestinations = [...grouped.entries()].sort((a, b) => {
    const totalA = a[1].reduce((s, x) => s + x.deals, 0);
    const totalB = b[1].reduce((s, x) => s + x.deals, 0);
    return totalB - totalA;
  });

  // Feature block: ranked bars. Bar length is the only measure this cache
  // read supports (min_usd per route, no history/verdict) — each bar is
  // relative to the most expensive tracked route in the list, fill stays
  // --accent (no amber modifier: distinctRoutesInCache carries no buy/wait
  // verdict, so nothing here signals "wait").
  const maxPrice = routes.reduce((m, r) => Math.max(m, r.min_usd), 0);

  return (
    <div>
      <div className="ed-eyebrow">All routes</div>
      <FcPageHead
        title="Track any route, real pricing, continuously refreshed"
        lede="We poll Travelpayouts for every route below and cache the result. Click a route for cached cheapest dates and a one-click booking shortcut."
        action={<Link href="/searches" className="ed-btn ed-btn-secondary">Add a route →</Link>}
      />
      <p className="ed-panel-note" style={{ marginTop: -18, marginBottom: 28 }}>
        <span>{routes.length} routes tracked</span> · <span>Continuously refreshed</span>
      </p>

      {sortedDestinations.length === 0 ? (
        /* ─── Empty state ─── */
        <div className="ed-tiles">
          {[
            { title: 'Add a route to track', desc: 'Head to Tracked Searches to add a route. We start checking it immediately and keep going indefinitely — most often when it is close to departure or close to your target.', href: '/searches', cta: 'Add route →' },
            { title: 'Explore cheap deals', desc: 'Browse current deals from your home city with live price filters.', href: '/explore', cta: 'Browse deals →' },
            { title: 'Search live fares', desc: 'Run a live multi-provider search across Aviasales, Google Flights, and more.', href: '/offers', cta: 'Search now →' },
          ].map(c => (
            <Link key={c.href} href={c.href} className="ed-tile">
              <div className="ed-tile-value" style={{ fontSize: 16 }}>{c.title}</div>
              <p className="ed-tile-meta">{c.desc}</p>
              <span className="ed-btn ed-btn-tile">{c.cta}</span>
            </Link>
          ))}
        </div>
      ) : (
        /* ─── Route groups, ranked bars per destination ─── */
        <div style={{ display: 'grid', gap: 24 }}>
          {sortedDestinations.map(([dest, rs]) => {
            const dA = airportByCode(dest);
            return (
              <FcPanel
                key={dest}
                title={dA ? `${dA.city}, ${dA.country}` : dest}
                note={`${rs.length} origin${rs.length > 1 ? 's' : ''} · ${rs.reduce((s, x) => s + x.deals, 0)} cached deals`}
              >
                <div className="ed-ranked">
                  {rs.map(r => {
                    const oA = airportByCode(r.origin);
                    const pct = maxPrice > 0 ? (r.min_usd / maxPrice) * 100 : 0;
                    return (
                      <div className="ed-ranked-row" key={`${r.origin}-${r.destination}`}>
                        <div>
                          <div className="ed-ranked-name" style={{ fontFamily: 'var(--font-mono-ed)' }}>{r.origin} → {r.destination}</div>
                          <div className="ed-ranked-meta">
                            {oA?.city ?? r.origin} to {dA?.city ?? r.destination} · {r.deals} cached
                          </div>
                        </div>
                        <div className="ed-bar"><div className="ed-bar-fill" style={{ width: `${pct}%` }} /></div>
                        <div className="ed-ranked-value">from {fmtUSD(r.min_usd)}</div>
                        <Link
                          className="ed-btn ed-btn-row"
                          href={`/routes/${r.origin.toLowerCase()}-${r.destination.toLowerCase()}`}
                        >
                          ›
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </FcPanel>
            );
          })}
        </div>
      )}

      <hr className="ed-rule" style={{ margin: '32px 0 16px' }} />
      <p className="ed-sub" style={{ margin: 0 }}>
        Don&apos;t see your route?{' '}
        <Link href="/searches" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Add a tracker on the Searches page</Link>
        {' '}and we&apos;ll start checking it straight away.
      </p>
    </div>
  );
}

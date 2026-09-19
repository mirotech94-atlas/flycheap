import Link from 'next/link';
import { queries } from '@/lib/db';
import { airportByCode } from '@/lib/airports';
import { fmtUSD } from '@/lib/utils';
import { getCityGradient } from '@/lib/cityGradients';

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

  return (
    <div className="space-y-8 motion-fade-in">
      {/* HERO */}
      <section className="relative rounded-3xl bg-brand-gradient text-white border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-brand-gold/25 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-brand-400/20 blur-3xl" />
        </div>
        <div className="relative px-8 py-10">
          <div className="eyebrow !text-white/70 mb-1">All routes</div>
          <h1 className="font-display font-extrabold text-3xl md:text-4xl tracking-tight">
            Track any route,{' '}
            <span className="text-brand-gold">real pricing every 30 minutes</span>
          </h1>
          <p className="text-white/75 mt-2 max-w-xl text-sm md:text-base">
            We poll Travelpayouts for every route below, every hour. Click a route for cached cheapest
            dates and a one-click booking shortcut.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/60">
            <span>{routes.length} routes tracked</span>
            <span className="hidden sm:inline text-white/30">·</span>
            <span>Refreshed every hour</span>
            <span className="hidden sm:inline text-white/30">·</span>
            <span>
              <Link href="/searches" className="underline underline-offset-2 hover:text-white transition">Add a route →</Link>
            </span>
          </div>
        </div>
      </section>

      {sortedDestinations.length === 0 ? (
        /* ─── Empty state ─── */
        <section className="grid sm:grid-cols-3 gap-4">
          {[
            { title: 'Add a route to track', desc: 'Head to Tracked Searches to add a route. We start polling immediately — every 30 minutes (5 on Pro) — and keep going indefinitely.', href: '/searches', cta: 'Add route →', grad: { from: '#0a3a6b', to: '#1a6ba0' } },
            { title: 'Explore cheap deals', desc: 'Browse current deals from your home city with live price filters.', href: '/explore', cta: 'Browse deals →', grad: { from: '#0a5a3a', to: '#1a8b60' } },
            { title: 'Search live fares', desc: 'Run a live multi-provider search across Aviasales, Google Flights, and more.', href: '/offers', cta: 'Search now →', grad: { from: '#5a3a0a', to: '#8b5a1a' } },
          ].map(c => (
            <Link key={c.href} href={c.href}
              className="group relative overflow-hidden rounded-2xl flex flex-col justify-end min-h-[160px] hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
            >
              <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${c.grad.from} 0%, ${c.grad.to} 100%)` }} />
              <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="relative p-5">
                <div className="text-white font-bold text-base font-display mb-1">{c.title}</div>
                <p className="text-white/60 text-xs leading-relaxed">{c.desc}</p>
                <div className="mt-3 text-white/50 text-[10px] group-hover:text-white/90 transition flex items-center gap-1 uppercase tracking-wider font-semibold">
                  {c.cta}
                </div>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        /* ─── Route cards ─── */
        <section className="space-y-6">
          {sortedDestinations.map(([dest, rs]) => {
            const dA = airportByCode(dest);
            const grad = getCityGradient(dest);
            return (
              <div key={dest}>
                <div className="flex items-center gap-3 mb-3">
                  {/* Destination gradient mini-badge */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `linear-gradient(135deg, ${grad.from} 0%, ${grad.to} 100%)` }}
                  >
                    <span className="text-white font-black text-xs font-mono">{dest}</span>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                      {dA ? `${dA.city}, ${dA.country}` : dest}
                    </h2>
                    <span className="text-xs text-slate-400">{rs.length} origin{rs.length > 1 ? 's' : ''} · {rs.reduce((s, x) => s + x.deals, 0)} cached deals</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {rs.map(r => {
                    const oA = airportByCode(r.origin);
                    const rGrad = getCityGradient(r.destination);
                    return (
                      <Link
                        key={`${r.origin}-${r.destination}`}
                        href={`/routes/${r.origin.toLowerCase()}-${r.destination.toLowerCase()}`}
                        className="group relative overflow-hidden rounded-xl flex items-center gap-4 p-4 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
                        style={{ background: `linear-gradient(135deg, ${rGrad.from} 0%, ${rGrad.to} 100%)` }}
                      >
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '14px 14px' }} />
                        <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
                        <div className="relative flex-1 min-w-0">
                          <div className="font-bold text-white text-sm">{r.origin} → {r.destination}</div>
                          <div className="text-white/60 text-[10px] mt-0.5 truncate">
                            {oA?.city ?? r.origin} to {dA?.city ?? r.destination}
                          </div>
                        </div>
                        <div className="relative text-right shrink-0">
                          <div className="text-[#E8A33D] font-black text-base tabular">from {fmtUSD(r.min_usd)}</div>
                          <div className="text-white/50 text-[9px] uppercase tracking-wide">{r.deals} cached</div>
                        </div>
                        <div className="relative text-white/30 group-hover:text-white/70 text-sm transition">›</div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <p className="text-xs text-slate-400 pt-4 border-t border-slate-200 dark:border-slate-800">
        Don&apos;t see your route?{' '}
        <Link href="/searches" className="text-brand-700 underline">Add a tracker on the Searches page</Link>
        {' '}and we&apos;ll start polling it every 30 minutes.
      </p>
    </div>
  );
}

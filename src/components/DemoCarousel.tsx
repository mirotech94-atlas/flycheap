'use client';

import { useEffect, useState } from 'react';

const SLIDES: Array<{ tag: string; title: string; body: string; svg: React.ReactNode }> = [
  {
    tag: 'Dashboard',
    title: 'Executive KPI strip',
    body: 'Cheapest fare right now, vs your target, deals under target, and tracked routes — at a glance.',
    svg: (
      <svg viewBox="0 0 480 280" className="w-full h-full">
        <rect width="480" height="280" fill="var(--surface-2)" />
        {/* 4 KPI tiles */}
        {[0,1,2,3].map(i => (
          <g key={i} transform={`translate(${20 + i * 110} 30)`}>
            <rect width="100" height="80" fill={i === 0 ? 'var(--accent)' : 'var(--surface)'} stroke="var(--rule)" />
            <text x="10" y="20" fontSize="8" fill={i === 0 ? 'var(--on-accent)' : 'var(--muted)'} fillOpacity={i === 0 ? 0.85 : 1} fontWeight="700" letterSpacing="1">{['CHEAPEST','VS TARGET','UNDER','ROUTES'][i]}</text>
            <text x="10" y="48" fontSize="22" fontWeight="800" fill={i === 0 ? 'var(--on-accent)' : 'var(--ink)'} fontFamily="system-ui">{['$865','-$35','12','5'][i]}</text>
            <text x="10" y="65" fontSize="7" fill={i === 0 ? 'var(--on-accent)' : 'var(--muted-2)'} fillOpacity={i === 0 ? 0.7 : 1}>{['JFK→CAI','below ✓','/24 deals','tracked'][i]}</text>
          </g>
        ))}
        {/* Bar chart row */}
        <rect x="20" y="135" width="440" height="125" fill="var(--surface)" stroke="var(--rule)" />
        <text x="32" y="155" fontSize="9" fill="var(--muted)" fontWeight="700">PRICE TREND · 30D</text>
        <polyline fill="none" stroke="var(--ink)" strokeWidth="2" points="40,235 80,225 120,210 160,215 200,200 240,195 280,180 320,175 360,170 400,168 440,165" />
        <polyline fill="var(--accent)" fillOpacity="0.12" stroke="none" points="40,235 80,225 120,210 160,215 200,200 240,195 280,180 320,175 360,170 400,168 440,165 440,250 40,250" />
        <line x1="40" x2="440" y1="195" y2="195" stroke="var(--green)" strokeDasharray="3 3" strokeWidth="1" opacity=".6" />
        <text x="445" y="198" fontSize="8" fill="var(--green)" fontWeight="600">TGT</text>
      </svg>
    ),
  },
  {
    tag: 'Explore',
    title: 'World map of cheap fares',
    body: 'See the cheapest reachable destination from any home city, color-banded by price. Click any dot to drill in.',
    svg: (
      <svg viewBox="0 0 480 280" className="w-full h-full">
        <rect width="480" height="280" fill="var(--surface-2)" />
        <g fill="var(--muted-2)" fillOpacity=".25">
          <path d="M 50,90 Q 40,140 60,170 L 120,200 160,180 140,110 90,80 Z" />
          <path d="M 230,80 Q 230,140 240,200 L 280,250 320,220 310,150 280,90 Z" />
          <path d="M 360,90 Q 380,140 420,150 L 450,120 410,80 Z" />
        </g>
        {/* Origin */}
        <circle cx="80" cy="120" r="9" fill="var(--amber)" fillOpacity=".2" />
        <circle cx="80" cy="120" r="5" fill="var(--amber)" stroke="var(--surface)" strokeWidth="1.5" />
        {/* Dots — cheapest to priciest reads green -> amber -> red, the same
            price-colour scale GlobeHUD's colorForPrice uses. */}
        {[
          [180, 110, 'var(--green)', 'LON'], [240, 130, 'var(--green)', 'PAR'], [300, 150, 'var(--amber)', 'DXB'],
          [380, 170, 'var(--amber)', 'TYO'], [220, 200, 'var(--red)', 'CAI'], [410, 220, 'var(--red)', 'SYD'],
          [120, 160, 'var(--green)', 'MIA'], [280, 100, 'var(--green)', 'BCN'],
        ].map(([x, y, c, l], i) => (
          <g key={i}>
            <circle cx={x as number} cy={y as number} r="8" fill={c as string} fillOpacity=".25" />
            <circle cx={x as number} cy={y as number} r="5" fill={c as string} stroke="var(--surface)" strokeWidth="1" />
            <text x={x as number} y={(y as number) - 9} textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--ink)">{l}</text>
          </g>
        ))}
        {/* Arc */}
        <path d="M 80,120 Q 200,40 380,170" stroke="var(--ink)" strokeWidth="1" fill="none" opacity=".18" />
      </svg>
    ),
  },
  {
    tag: 'Predictions',
    title: 'Buy now or wait?',
    body: 'Hopper-style verdict on every tracked route. Plain-English reason, percentile slider, 30-day median.',
    svg: (
      <svg viewBox="0 0 480 280" className="w-full h-full">
        <rect width="480" height="280" fill="var(--surface)" stroke="var(--rule)" />
        <rect x="20" y="20" width="440" height="64" fill="var(--green)" />
        <text x="40" y="44" fontSize="10" fontWeight="700" fill="var(--on-accent)" fillOpacity="0.85" letterSpacing="1.5">RECOMMENDATION · HIGH CONFIDENCE</text>
        <text x="40" y="72" fontSize="22" fontWeight="800" fill="var(--on-accent)" fontFamily="system-ui">✅ Buy now</text>
        <text x="445" y="48" textAnchor="end" fontSize="9" fill="var(--on-accent)" fillOpacity="0.85" letterSpacing="1">RIGHT NOW</text>
        <text x="445" y="72" textAnchor="end" fontSize="22" fontWeight="800" fill="var(--on-accent)" fontFamily="system-ui">$865</text>
        {/* Reason */}
        <text x="35" y="115" fontSize="11" fill="var(--ink)" fontWeight="500">At the 30-day low ($865). Below your $900 target.</text>
        {/* Percentile slider */}
        <text x="35" y="145" fontSize="9" fill="var(--green)" fontWeight="700">$865 30D LOW</text>
        <text x="445" y="145" fontSize="9" fill="var(--red)" textAnchor="end" fontWeight="700">$1,420 30D HIGH</text>
        {/* Flat three-band track (green/amber/red) instead of a gradient fill. */}
        <rect x="35" y="155" width="136" height="8" fill="var(--green)" />
        <rect x="171" y="155" width="137" height="8" fill="var(--amber)" />
        <rect x="308" y="155" width="137" height="8" fill="var(--red)" />
        <circle cx="55" cy="159" r="7" fill="var(--green)" stroke="var(--surface)" strokeWidth="2" />
        <text x="240" y="180" fontSize="8" fill="var(--muted)" textAnchor="middle">you're at the 5th percentile</text>
        {/* Stats row */}
        {[['TREND','-8%','var(--green)'],['MEDIAN','$1,150',''],['VS TGT','-4%','var(--green)']].map(([l, v, c], i) => (
          <g key={i} transform={`translate(${40 + i * 145} 215)`}>
            <text fontSize="8" fill="var(--muted-2)" letterSpacing="1" fontWeight="700">{l}</text>
            <text y="20" fontSize="16" fontWeight="800" fill={(c as string) || 'var(--ink)'}>{v}</text>
          </g>
        ))}
      </svg>
    ),
  },
  {
    tag: 'Alerts',
    title: 'Multi-channel alerts',
    body: 'Threshold-cross + price-drop emails by default. Pro plan unlocks SMS, WhatsApp, Telegram.',
    svg: (
      <svg viewBox="0 0 480 280" className="w-full h-full">
        <rect width="480" height="280" fill="var(--surface-2)" />
        {/* Inbox card */}
        <rect x="40" y="30" width="400" height="220" fill="var(--surface)" stroke="var(--rule)" />
        <rect x="40" y="30" width="400" height="40" fill="var(--panel-bg)" />
        <text x="60" y="55" fontSize="11" fill="var(--panel-fg)" fontWeight="700">📬 Inbox</text>
        {/* Email rows — red=price drop, green=cheap-fare alert, accent=digest/info. */}
        {[
          ['📉 PRICE DROP −12%', 'EgyptAir JFK→CAI · $785/adult', 'var(--red)'],
          ['✈️ Cheap fare alert', 'JFK→LON · $410/adult below $500 target', 'var(--green)'],
          ['📊 Weekly digest', 'Top movers + best deals from your home city', 'var(--accent)'],
        ].map(([title, body, c], i) => (
          <g key={i} transform={`translate(56 ${85 + i * 52})`}>
            <rect width="368" height="44" fill={`color-mix(in srgb, ${c as string} 10%, var(--surface))`} />
            <circle cx="22" cy="22" r="8" fill={c as string} />
            <text x="42" y="20" fontSize="11" fontWeight="700" fill="var(--ink)">{title}</text>
            <text x="42" y="35" fontSize="9" fill="var(--muted)">{body}</text>
          </g>
        ))}
      </svg>
    ),
  },
];

export function DemoCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive(a => (a + 1) % SLIDES.length), 4500);
    return () => clearInterval(id);
  }, [paused]);

  const slide = SLIDES[active];

  return (
    <section className="relative max-w-6xl mx-auto px-6 py-20" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="text-center max-w-2xl mx-auto motion-slide-up">
        <div className="ed-eyebrow" style={{ textAlign: 'center' }}>See it in motion</div>
        <h2 className="ed-h2" style={{ fontSize: 34, textAlign: 'center' }}>
          A real product, today.
        </h2>
        <p className="ed-sub" style={{ margin: '14px auto 0', textAlign: 'center' }}>
          Every screen below is rendered live in the actual app — not a marketing mockup.
          Tabs auto-advance; hover to pause.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Tab list */}
        <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible">
          {SLIDES.map((s, i) => {
            const isActive = active === i;
            return (
              <button
                key={s.tag}
                onClick={() => setActive(i)}
                className={`ed-btn ${isActive ? 'ed-btn-primary' : 'ed-btn-secondary'} shrink-0 lg:w-full`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', height: 'auto', padding: '12px 14px', opacity: isActive ? 1 : 0.72 }}
              >
                <div className="ed-mono" style={{ letterSpacing: '0.1em', fontSize: 10, color: isActive ? 'inherit' : 'var(--muted-2)' }}>{s.tag}</div>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 4 }}>{s.title}</div>
                <div className="hidden lg:block line-clamp-2" style={{ fontSize: 11, marginTop: 4, color: isActive ? 'inherit' : 'var(--muted)' }}>{s.body}</div>
              </button>
            );
          })}
        </div>

        {/* Display panel */}
        <div className="ed-panel p-3 md:p-5 motion-fade-in" key={active /* re-mount on slide change to retrigger fade */}>
          <div className="flex items-center gap-1.5 mb-2" style={{ background: 'var(--surface-2)', padding: '6px 10px' }}>
            <span className="ed-dot red" />
            <span className="ed-dot amber" />
            <span className="ed-dot" />
            <span className="ml-3 font-mono" style={{ fontSize: 10, color: 'var(--ink-soft)' }}>flycheap.live / {slide.tag.toLowerCase()}</span>
          </div>
          <div className="aspect-[480/280] overflow-hidden" style={{ border: '1px solid var(--rule-strong)', background: 'var(--surface)' }}>
            {slide.svg}
          </div>
          {/* Progress dots (mobile) */}
          <div className="flex items-center justify-center gap-1.5 mt-3 lg:hidden">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className="h-1.5 transition-all"
                style={{ width: active === i ? 24 : 6, background: active === i ? 'var(--accent)' : 'var(--track)' }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

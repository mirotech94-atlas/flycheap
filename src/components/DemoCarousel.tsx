'use client';

import { useEffect, useState } from 'react';

const SLIDES: Array<{ tag: string; title: string; body: string; svg: React.ReactNode; accent: string }> = [
  {
    tag: 'Dashboard',
    title: 'Executive KPI strip',
    body: 'Cheapest fare right now, vs your target, deals under target, and tracked routes — at a glance.',
    accent: '#0a3a6b',
    svg: (
      <svg viewBox="0 0 480 280" className="w-full h-full">
        <defs>
          <linearGradient id="kpi1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1f5fa5"/><stop offset="100%" stopColor="#0a3a6b"/></linearGradient>
        </defs>
        <rect width="480" height="280" rx="14" fill="#f4f6fb" />
        {/* 4 KPI tiles */}
        {[0,1,2,3].map(i => (
          <g key={i} transform={`translate(${20 + i * 110} 30)`}>
            <rect width="100" height="80" rx="10" fill={i === 0 ? 'url(#kpi1)' : 'white'} stroke="#e5e9f1" />
            <text x="10" y="20" fontSize="8" fill={i === 0 ? '#ffffffcc' : '#5b6678'} fontWeight="700" letterSpacing="1">{['CHEAPEST','VS TARGET','UNDER','ROUTES'][i]}</text>
            <text x="10" y="48" fontSize="22" fontWeight="800" fill={i === 0 ? '#fff' : '#0b1220'} fontFamily="system-ui">{['$865','-$35','12','5'][i]}</text>
            <text x="10" y="65" fontSize="7" fill={i === 0 ? '#ffffff99' : '#94a3b8'}>{['JFK→CAI','below ✓','/24 deals','tracked'][i]}</text>
          </g>
        ))}
        {/* Bar chart row */}
        <rect x="20" y="135" width="440" height="125" rx="10" fill="white" stroke="#e5e9f1" />
        <text x="32" y="155" fontSize="9" fill="#5b6678" fontWeight="700">PRICE TREND · 30D</text>
        <polyline fill="none" stroke="#0a3a6b" strokeWidth="2" points="40,235 80,225 120,210 160,215 200,200 240,195 280,180 320,175 360,170 400,168 440,165" />
        <polyline fill="rgba(10,58,107,.12)" stroke="none" points="40,235 80,225 120,210 160,215 200,200 240,195 280,180 320,175 360,170 400,168 440,165 440,250 40,250" />
        <line x1="40" x2="440" y1="195" y2="195" stroke="#10b981" strokeDasharray="3 3" strokeWidth="1" opacity=".6" />
        <text x="445" y="198" fontSize="8" fill="#10b981" fontWeight="600">TGT</text>
      </svg>
    ),
  },
  {
    tag: 'Explore',
    title: 'World map of cheap fares',
    body: 'See the cheapest reachable destination from any home city, color-banded by price. Click any dot to drill in.',
    accent: '#047857',
    svg: (
      <svg viewBox="0 0 480 280" className="w-full h-full">
        <rect width="480" height="280" rx="14" fill="#eaf3ff" />
        <g fill="rgba(148,163,184,.25)">
          <path d="M 50,90 Q 40,140 60,170 L 120,200 160,180 140,110 90,80 Z" />
          <path d="M 230,80 Q 230,140 240,200 L 280,250 320,220 310,150 280,90 Z" />
          <path d="M 360,90 Q 380,140 420,150 L 450,120 410,80 Z" />
        </g>
        {/* Origin */}
        <circle cx="80" cy="120" r="9" fill="rgba(212,175,55,.2)" />
        <circle cx="80" cy="120" r="5" fill="#d4af37" stroke="white" strokeWidth="1.5" />
        {/* Dots */}
        {[
          [180, 110, '#10b981', 'LON'], [240, 130, '#22c55e', 'PAR'], [300, 150, '#84cc16', 'DXB'],
          [380, 170, '#eab308', 'TYO'], [220, 200, '#f97316', 'CAI'], [410, 220, '#ef4444', 'SYD'],
          [120, 160, '#10b981', 'MIA'], [280, 100, '#22c55e', 'BCN'],
        ].map(([x, y, c, l], i) => (
          <g key={i}>
            <circle cx={x as number} cy={y as number} r="8" fill={c as string} fillOpacity=".25" />
            <circle cx={x as number} cy={y as number} r="5" fill={c as string} stroke="white" strokeWidth="1" />
            <text x={x as number} y={(y as number) - 9} textAnchor="middle" fontSize="8" fontWeight="700" fill="#0b1220">{l}</text>
          </g>
        ))}
        {/* Arc */}
        <path d="M 80,120 Q 200,40 380,170" stroke="#0a3a6b" strokeWidth="1" fill="none" opacity=".18" />
      </svg>
    ),
  },
  {
    tag: 'Predictions',
    title: 'Buy now or wait?',
    body: 'Hopper-style verdict on every tracked route. Plain-English reason, percentile slider, 30-day median.',
    accent: '#16a34a',
    svg: (
      <svg viewBox="0 0 480 280" className="w-full h-full">
        <rect width="480" height="280" rx="14" fill="white" stroke="#e5e9f1" />
        <defs><linearGradient id="buyGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#10b981"/><stop offset="100%" stopColor="#059669"/></linearGradient></defs>
        <rect x="20" y="20" width="440" height="64" rx="10" fill="url(#buyGrad)" />
        <text x="40" y="44" fontSize="10" fontWeight="700" fill="#ffffffcc" letterSpacing="1.5">RECOMMENDATION · HIGH CONFIDENCE</text>
        <text x="40" y="72" fontSize="22" fontWeight="800" fill="white" fontFamily="system-ui">✅ Buy now</text>
        <text x="445" y="48" textAnchor="end" fontSize="9" fill="#ffffffcc" letterSpacing="1">RIGHT NOW</text>
        <text x="445" y="72" textAnchor="end" fontSize="22" fontWeight="800" fill="white" fontFamily="system-ui">$865</text>
        {/* Reason */}
        <text x="35" y="115" fontSize="11" fill="#0b1220" fontWeight="500">At the 30-day low ($865). Below your $900 target.</text>
        {/* Percentile slider */}
        <text x="35" y="145" fontSize="9" fill="#10b981" fontWeight="700">$865 30D LOW</text>
        <text x="445" y="145" fontSize="9" fill="#dc2626" textAnchor="end" fontWeight="700">$1,420 30D HIGH</text>
        <rect x="35" y="155" width="410" height="8" rx="4" fill="url(#tlGrad)" />
        <defs><linearGradient id="tlGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a7f3d0"/><stop offset="50%" stopColor="#fde68a"/><stop offset="100%" stopColor="#fecaca"/>
        </linearGradient></defs>
        <circle cx="55" cy="159" r="7" fill="#10b981" stroke="white" strokeWidth="2" />
        <text x="240" y="180" fontSize="8" fill="#5b6678" textAnchor="middle">you're at the 5th percentile</text>
        {/* Stats row */}
        {[['TREND','-8%','#10b981'],['MEDIAN','$1,150',''],['VS TGT','-4%','#10b981']].map(([l, v, c], i) => (
          <g key={i} transform={`translate(${40 + i * 145} 215)`}>
            <text fontSize="8" fill="#94a3b8" letterSpacing="1" fontWeight="700">{l}</text>
            <text y="20" fontSize="16" fontWeight="800" fill={c as string || '#0b1220'}>{v}</text>
          </g>
        ))}
      </svg>
    ),
  },
  {
    tag: 'Alerts',
    title: 'Multi-channel alerts',
    body: 'Threshold-cross + price-drop emails by default. Pro plan unlocks SMS, WhatsApp, Telegram.',
    accent: '#dc2626',
    svg: (
      <svg viewBox="0 0 480 280" className="w-full h-full">
        <rect width="480" height="280" rx="14" fill="#f8fafc" />
        {/* Inbox card */}
        <rect x="40" y="30" width="400" height="220" rx="12" fill="white" stroke="#e5e9f1" />
        <rect x="40" y="30" width="400" height="40" rx="12" fill="#0a3a6b" />
        <text x="60" y="55" fontSize="11" fill="white" fontWeight="700">📬 Inbox</text>
        {/* Email rows */}
        {[
          ['📉 PRICE DROP −12%', 'EgyptAir JFK→CAI · $785/adult', '#fee2e2', '#dc2626'],
          ['✈️ Cheap fare alert', 'JFK→LON · $410/adult below $500 target', '#dcfce7', '#16a34a'],
          ['📊 Weekly digest', 'Top movers + best deals from your home city', '#dbeafe', '#3730a3'],
        ].map(([title, body, bg, c], i) => (
          <g key={i} transform={`translate(56 ${85 + i * 52})`}>
            <rect width="368" height="44" rx="6" fill={bg as string} />
            <circle cx="22" cy="22" r="8" fill={c as string} />
            <text x="42" y="20" fontSize="11" fontWeight="700" fill="#0b1220">{title}</text>
            <text x="42" y="35" fontSize="9" fill="#5b6678">{body}</text>
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
        <div className="eyebrow text-brand-700">See it in motion</div>
        <h2 className="font-display font-bold text-4xl text-slate-900 dark:text-white mt-2">
          A real product, today.
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-4">
          Every screen below is rendered live in the actual app — not a marketing mockup.
          Tabs auto-advance; hover to pause.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Tab list */}
        <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible">
          {SLIDES.map((s, i) => (
            <button
              key={s.tag}
              onClick={() => setActive(i)}
              className={`text-left p-4 rounded-xl border-2 transition shrink-0 lg:w-full ${
                active === i
                  ? 'border-brand bg-brand/5'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 opacity-70'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">{s.tag}</div>
              <div className="font-display font-bold text-sm mt-1 text-slate-900 dark:text-white">{s.title}</div>
              <div className="text-[11px] text-slate-500 mt-1 line-clamp-2 hidden lg:block">{s.body}</div>
            </button>
          ))}
        </div>

        {/* Display panel */}
        <div className="card card-elevated p-3 md:p-5 motion-fade-in" key={active /* re-mount on slide change to retrigger fade */}>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="ml-3 text-[10px] text-slate-400 font-mono">flycheap.18dn.com / {slide.tag.toLowerCase()}</span>
          </div>
          <div className="aspect-[480/280] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white">
            {slide.svg}
          </div>
          {/* Progress dots (mobile) */}
          <div className="flex items-center justify-center gap-1.5 mt-3 lg:hidden">
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setActive(i)} className={`h-1.5 rounded-full transition-all ${active === i ? 'w-6 bg-brand' : 'w-1.5 bg-slate-300'}`} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

import Link from 'next/link';

type Action = { label: string; href: string; primary?: boolean };

export function EmptyState({
  icon = '✈️',
  eyebrow,
  title,
  description,
  actions = [],
  illustration,
}: {
  icon?: string;
  eyebrow?: string;
  title: string;
  description: string;
  actions?: Action[];
  illustration?: 'flight' | 'world' | 'chart';
}) {
  return (
    <div className="card card-feature relative overflow-hidden text-center py-12 px-6 motion-fade-in">
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-brand/5 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-brand-gold/10 blur-3xl pointer-events-none" />

      {illustration && <Illustration kind={illustration} />}

      <div className="relative">
        {!illustration && (
          <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-gradient grid place-items-center text-3xl shadow-lift mb-4 motion-float">
            {icon}
          </div>
        )}
        {eyebrow && <div className="eyebrow text-brand-700">{eyebrow}</div>}
        <h2 className="font-display font-bold text-2xl text-slate-900 dark:text-white mt-1 !mb-2">{title}</h2>
        <p className="text-slate-500 max-w-md mx-auto leading-relaxed">{description}</p>
        {actions.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
            {actions.map(a => (
              <Link key={a.href} href={a.href} className={`btn ${a.primary ? 'btn-primary' : ''}`}>
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Illustration({ kind }: { kind: 'flight' | 'world' | 'chart' }) {
  if (kind === 'flight') {
    return (
      <div className="relative h-32 mb-4 motion-float">
        <svg viewBox="0 0 200 80" className="mx-auto w-48 h-32" aria-hidden>
          <defs>
            <linearGradient id="planeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1f5fa5" /><stop offset="100%" stopColor="#0B1220" />
            </linearGradient>
          </defs>
          {/* Dotted flight path */}
          <path d="M 10 60 Q 100 0 190 50" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="3 4" />
          {/* Plane */}
          <g transform="translate(100 30) rotate(-20)">
            <path d="M -16 0 L 16 0 L 14 -3 L -10 -3 Z" fill="url(#planeGrad)" />
            <path d="M 4 0 L 12 -10 L 10 -10 L 0 0 Z" fill="url(#planeGrad)" />
            <path d="M -14 0 L -8 -8 L -10 -8 L -16 0 Z" fill="url(#planeGrad)" />
            <circle cx="-12" cy="0" r="1.5" fill="#E8A33D" />
          </g>
          {/* Origin / destination dots */}
          <circle cx="10" cy="60" r="4" fill="#E8A33D" stroke="white" strokeWidth="1.5" />
          <circle cx="190" cy="50" r="4" fill="#0B1220" stroke="white" strokeWidth="1.5" />
        </svg>
      </div>
    );
  }
  if (kind === 'world') {
    return (
      <div className="text-7xl motion-float mb-3">🌍</div>
    );
  }
  return <div className="text-7xl motion-float mb-3">📊</div>;
}

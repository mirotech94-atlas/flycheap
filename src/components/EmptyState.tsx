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
    <div className="ed-tile relative text-center py-12 px-6 motion-fade-in">
      {illustration && <Illustration kind={illustration} />}

      <div className="relative">
        {!illustration && (
          <div
            className="w-16 h-16 mx-auto grid place-items-center text-3xl mb-4 motion-float"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--rule)' }}
          >
            {icon}
          </div>
        )}
        {eyebrow && <div className="ed-eyebrow">{eyebrow}</div>}
        <h2 className="ed-h2 mt-1 !mb-2">{title}</h2>
        <p className="ed-sub max-w-md mx-auto">{description}</p>
        {actions.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
            {actions.map(a => (
              <Link key={a.href} href={a.href} className={`ed-btn ${a.primary ? 'ed-btn-primary' : 'ed-btn-secondary'}`}>
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
          {/* Dotted flight path */}
          <path d="M 10 60 Q 100 0 190 50" fill="none" stroke="var(--rule-strong)" strokeWidth="1.5" strokeDasharray="3 4" />
          {/* Plane */}
          <g transform="translate(100 30) rotate(-20)" fill="var(--ink)">
            <path d="M -16 0 L 16 0 L 14 -3 L -10 -3 Z" />
            <path d="M 4 0 L 12 -10 L 10 -10 L 0 0 Z" />
            <path d="M -14 0 L -8 -8 L -10 -8 L -16 0 Z" />
            <circle cx="-12" cy="0" r="1.5" fill="var(--accent)" />
          </g>
          {/* Origin / destination dots */}
          <circle cx="10" cy="60" r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
          <circle cx="190" cy="50" r="4" fill="var(--ink)" stroke="var(--surface)" strokeWidth="1.5" />
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

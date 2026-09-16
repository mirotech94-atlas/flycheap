export function Logo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-label="FlyCheap"
    >
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#1f5fa5" />
          <stop offset="55%"  stopColor="#0a3a6b" />
          <stop offset="100%" stopColor="#051d36" />
        </linearGradient>
        <linearGradient id="logo-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#f5d56b" />
          <stop offset="60%"  stopColor="#d4af37" />
          <stop offset="100%" stopColor="#a17e1f" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#logo-bg)" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="rgba(255,255,255,.10)" />
      {/* Fare-drop: a plane descending a dotted price line — fares falling to target. */}
      <polyline points="12,20 26,30 38,40 52,50" fill="none" stroke="url(#logo-gold)" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="1 5" />
      <circle cx="12" cy="20" r="2.8" fill="url(#logo-gold)" />
      <g transform="translate(52,50) rotate(35)">
        <path d="M0 -7 L6 6 L0 2 L-6 6 Z" fill="url(#logo-gold)" />
      </g>
    </svg>
  );
}

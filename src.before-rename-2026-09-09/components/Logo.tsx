export function Logo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-label="FlyCheap Tracker"
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
      <path
        d="M52.4 15.8c.6-.6.6-1.7 0-2.3-.6-.6-1.7-.6-2.3 0L37.6 26 17.5 22.5l-3.5 3.5 16.4 7.6L20 43l-7.6-1.4-2.5 2.5 9.7 4.7 4.7 9.7 2.5-2.5L25.4 48l9.4-10.4 7.6 16.4 3.5-3.5L42.4 30.4z"
        fill="url(#logo-gold)"
      />
    </svg>
  );
}

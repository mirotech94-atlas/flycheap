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
      {/* The tile is the cabin at night: deck-2 -> deck -> dark, the same three
          greys the panels use, so the mark sits on the product rather than on
          the retired navy it was drawn against.

          The fare-drop line and plane stay WARM, and this is the one place
          amber is allowed outside a fare or a primary action: the mark's
          subject IS a fare falling to target. Everything decorative elsewhere
          went teal precisely so this stays legible as the fare colour. */}
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          {/* Lifted one step off the panel greys. The first cut ran
              #1B2740 -> #131C2E -> #0B1220, i.e. the deck colours exactly --
              which meant the tile VANISHED on the admin console, whose panel
              IS #131C2E. The admin header logo has no halo behind it, so the
              mark was left floating with no tile at all. These sit just above
              the panel range so the tile reads on both grounds. */}
          <stop offset="0%"   stopColor="#24314D" />
          <stop offset="55%"  stopColor="#16203A" />
          <stop offset="100%" stopColor="#0B1220" />
        </linearGradient>
        <linearGradient id="logo-amber" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#F2C67A" />
          <stop offset="60%"  stopColor="#E8A33D" />
          <stop offset="100%" stopColor="#B87B22" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#logo-bg)" />
      {/* --rule-strong weight, not --rule: at the 28-30px the chrome renders
          this at, a .10 hairline disappears and the tile loses its edge. */}
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="13.5" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="1.5" />
      {/* Fare-drop: a plane descending a dotted price line — fares falling to target. */}
      <polyline points="12,20 26,30 38,40 52,50" fill="none" stroke="url(#logo-amber)" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="1 5" />
      <circle cx="12" cy="20" r="2.8" fill="url(#logo-amber)" />
      <g transform="translate(52,50) rotate(35)">
        <path d="M0 -7 L6 6 L0 2 L-6 6 Z" fill="url(#logo-amber)" />
      </g>
    </svg>
  );
}

/** The bare mark in `currentColor` (no navy tile), for brand-mark containers
 *  that already provide their own tile/background. Same fare-drop geometry as Logo. */
export function LogoMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size} fill="none" className={className} aria-hidden="true">
      <polyline points="12,20 26,30 38,40 52,50" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="1.5 7" />
      <circle cx="12" cy="20" r="4" fill="currentColor" />
      <g transform="translate(52,50) rotate(35)">
        <path d="M0 -9 L8 8 L0 3 L-8 8 Z" fill="currentColor" />
      </g>
    </svg>
  );
}

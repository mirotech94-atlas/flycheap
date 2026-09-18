// OpenGraph card image for social shares. Pure SVG → PNG-equivalent at the
// browser/render layer. 1200×630 is the standard social-share aspect ratio.

export const dynamic = 'force-static';

export async function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1f5fa5"/>
        <stop offset="55%" stop-color="#0a3a6b"/>
        <stop offset="100%" stop-color="#051d36"/>
      </linearGradient>
      <radialGradient id="goldGlow" cx="80%" cy="20%" r="50%">
        <stop offset="0%" stop-color="rgba(212,175,55,.30)"/>
        <stop offset="100%" stop-color="rgba(212,175,55,0)"/>
      </radialGradient>
      <linearGradient id="planeGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f5d56b"/>
        <stop offset="60%" stop-color="#d4af37"/>
        <stop offset="100%" stop-color="#a17e1f"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <rect width="1200" height="630" fill="url(#goldGlow)"/>
    <!-- Decorative circles -->
    <circle cx="1100" cy="100" r="180" fill="rgba(212,175,55,.08)"/>
    <circle cx="100"  cy="500" r="220" fill="rgba(31,95,165,.18)"/>
    <!-- Logo box -->
    <g transform="translate(80 80)">
      <rect width="80" height="80" rx="18" fill="#0a3a6b"/>
      <rect width="80" height="80" rx="18" fill="none" stroke="rgba(255,255,255,.12)"/>
      <path d="M67.5 22 c.6-.6.6-1.7 0-2.3-.6-.6-1.7-.6-2.3 0L52.7 32.5 32.6 29l-3.5 3.5 16.4 7.6L35 49.5l-7.6-1.4-2.5 2.5 9.7 4.7 4.7 9.7 2.5-2.5L40.4 54.5l9.4-10.4 7.6 16.4 3.5-3.5L57.4 36.9z"
            fill="url(#planeGrad)" transform="translate(-15 -15) scale(1.25)"/>
    </g>
    <text x="180" y="115" font-family="system-ui,Helvetica" font-size="34" font-weight="800" fill="#ffffff">
      FlyCheap
    </text>
    <text x="180" y="148" font-family="system-ui,Helvetica" font-size="16" font-weight="600" fill="#d4af37" letter-spacing="3">
      LIVE FLIGHT INTELLIGENCE
    </text>
    <!-- Headline -->
    <text x="80" y="320" font-family="system-ui,Helvetica" font-size="84" font-weight="900" fill="#ffffff" letter-spacing="-2">
      The cheapest fares,
    </text>
    <text x="80" y="410" font-family="system-ui,Helvetica" font-size="84" font-weight="900" fill="#d4af37" letter-spacing="-2">
      monitored for you.
    </text>
    <!-- Sub -->
    <text x="80" y="470" font-family="system-ui,Helvetica" font-size="22" font-weight="500" fill="rgba(255,255,255,.75)">
      Track 1,000+ airlines · email when fares drop · explore worldwide
    </text>
    <!-- Stats row -->
    <g transform="translate(80 530)">
      <text font-family="system-ui,Helvetica" font-size="28" font-weight="800" fill="#d4af37">1,000+</text>
      <text x="80" font-family="system-ui,Helvetica" font-size="14" fill="rgba(255,255,255,.7)" letter-spacing="2">AIRLINES</text>

      <text x="280" font-family="system-ui,Helvetica" font-size="28" font-weight="800" fill="#d4af37">24/7</text>
      <text x="350" font-family="system-ui,Helvetica" font-size="14" fill="rgba(255,255,255,.7)" letter-spacing="2">POLLING</text>

      <text x="510" font-family="system-ui,Helvetica" font-size="28" font-weight="800" fill="#d4af37">$0</text>
      <text x="555" font-family="system-ui,Helvetica" font-size="14" fill="rgba(255,255,255,.7)" letter-spacing="2">FREE TIER</text>
    </g>
    <!-- URL pill -->
    <g transform="translate(940 540)">
      <rect width="180" height="40" rx="20" fill="rgba(255,255,255,.12)"/>
      <text x="90" y="26" text-anchor="middle" font-family="system-ui,Helvetica" font-size="14" font-weight="700" fill="white">flycheap.live</text>
    </g>
  </svg>`;
  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}

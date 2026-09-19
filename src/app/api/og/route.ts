// OpenGraph card image for social shares. Pure SVG → PNG-equivalent at the
// browser/render layer. 1200×630 is the standard social-share aspect ratio.

export const dynamic = 'force-static';

export async function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1B2740"/>
        <stop offset="55%" stop-color="#131C2E"/>
        <stop offset="100%" stop-color="#0B1220"/>
      </linearGradient>
      <!-- The logo tile is lifted off the panel greys, matching Logo.tsx, so
           the mark keeps its tile instead of dissolving into the card. -->
      <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#24314D"/>
        <stop offset="55%" stop-color="#16203A"/>
        <stop offset="100%" stop-color="#0B1220"/>
      </linearGradient>
      <radialGradient id="dawnGlow" cx="80%" cy="20%" r="50%">
        <stop offset="0%" stop-color="rgba(111,179,201,.22)"/>
        <stop offset="100%" stop-color="rgba(111,179,201,0)"/>
      </radialGradient>
      <linearGradient id="planeGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#F2C67A"/>
        <stop offset="60%" stop-color="#E8A33D"/>
        <stop offset="100%" stop-color="#B87B22"/>
      </linearGradient>
      <clipPath id="card"><rect width="1200" height="630"/></clipPath>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <rect width="1200" height="630" fill="url(#dawnGlow)"/>
    <!-- Decorative circles, clipped to the card: both overhang the 1200x630
         box, and without this they render over bare white wherever the
         renderer doesn't crop exactly to the viewBox. -->
    <g clip-path="url(#card)">
      <circle cx="1100" cy="100" r="180" fill="rgba(111,179,201,.07)"/>
      <circle cx="100"  cy="500" r="220" fill="rgba(47,111,145,.18)"/>
    </g>
    <!-- Logo box -->
    <g transform="translate(80 80)">
      <rect width="80" height="80" rx="18" fill="url(#tile)"/>
      <rect width="80" height="80" rx="18" fill="none" stroke="rgba(255,255,255,.12)"/>
      <g transform="scale(1.25)">
        <polyline points="12,20 26,30 38,40 52,50" fill="none" stroke="url(#planeGrad)" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="1 5"/>
        <circle cx="12" cy="20" r="2.8" fill="url(#planeGrad)"/>
        <g transform="translate(52,50) rotate(35)">
          <path d="M0 -7 L6 6 L0 2 L-6 6 Z" fill="url(#planeGrad)"/>
        </g>
      </g>
    </g>
    <text x="180" y="115" font-family="system-ui,Helvetica" font-size="34" font-weight="800" fill="#ffffff">
      FlyCheap
    </text>
    <text x="180" y="148" font-family="system-ui,Helvetica" font-size="16" font-weight="600" fill="#E8A33D" letter-spacing="3">
      LIVE FLIGHT INTELLIGENCE
    </text>
    <!-- Headline -->
    <text x="80" y="320" font-family="system-ui,Helvetica" font-size="84" font-weight="900" fill="#ffffff" letter-spacing="-2">
      The cheapest fares,
    </text>
    <text x="80" y="410" font-family="system-ui,Helvetica" font-size="84" font-weight="900" fill="#E8A33D" letter-spacing="-2">
      monitored for you.
    </text>
    <!-- Sub -->
    <text x="80" y="470" font-family="system-ui,Helvetica" font-size="22" font-weight="500" fill="rgba(255,255,255,.75)">
      Track 1,000+ airlines · email when fares drop · explore worldwide
    </text>
    <!-- Stats row -->
    <g transform="translate(80 530)">
      <text font-family="system-ui,Helvetica" font-size="28" font-weight="800" fill="#E8A33D">1,000+</text>
      <text x="180" font-family="system-ui,Helvetica" font-size="14" fill="rgba(255,255,255,.7)" letter-spacing="2">AIRLINES</text>

      <text x="280" font-family="system-ui,Helvetica" font-size="28" font-weight="800" fill="#E8A33D">24/7</text>
      <text x="350" font-family="system-ui,Helvetica" font-size="14" fill="rgba(255,255,255,.7)" letter-spacing="2">POLLING</text>

      <text x="510" font-family="system-ui,Helvetica" font-size="28" font-weight="800" fill="#E8A33D">$0</text>
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

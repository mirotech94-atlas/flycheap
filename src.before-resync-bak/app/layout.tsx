import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { ChatWidget } from '@/components/ChatWidget';
import { GlobeHUD } from '@/components/GlobeHUD';
import { GlobeProvider } from '@/lib/globeStore';
import { Logo } from '@/components/Logo';
import { HeaderControls } from '@/components/HeaderControls';
import { NavLinks } from '@/components/NavLinks';
import { CommandPalette } from '@/components/CommandPalette';
import { CompareTray } from '@/components/CompareTray';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { UserMenu } from '@/components/UserMenu';
import { getActiveTenant } from '@/lib/tenant';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const display = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display', display: 'swap', weight: ['500','600','700','800'] });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap', weight: ['400', '500', '700'] });

export const metadata: Metadata = {
  title: 'Cheapflight Tracker — Executive Dashboard',
  description: 'Cheap flights, monitored for you. Track 700+ airlines, get email alerts when fares drop.',
  applicationName: 'Cheapflight Tracker',
  appleWebApp: {
    capable: true,
    title: 'Cheapflight',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport = {
  themeColor: '#0a3a6b',
  width: 'device-width',
  initialScale: 1,
};

// Color helpers — used to build the brand gradient at request time so each
// tenant's chosen color flows through the layout without runtime JS.
function hexToRgb(hex: string): string {
  const m = hex.replace('#', '').match(/^([\da-f]{6})$/i);
  if (!m) return '10,58,107';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
function shadeColor(hex: string, percent: number): string {
  const m = hex.replace('#', '').match(/^([\da-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + Math.round(255 * percent / 100)));
  const g = Math.min(255, Math.max(0, ((n >> 8)  & 255) + Math.round(255 * percent / 100)));
  const b = Math.min(255, Math.max(0,  (n        & 255) + Math.round(255 * percent / 100)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const themeBoot = `
  try {
    var t = localStorage.getItem('egyptair-theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-tenant brand color (white-label) — apply at the root via inline CSS var.
  // Falls back to the default navy when the user hasn't set one.
  const user = await getActiveTenant();
  const brand = user?.brand_color || '#0a3a6b';
  const brandStyle = `:root{--brand:${brand};--brand-rgb:${hexToRgb(brand)};} .bg-brand-gradient{background:linear-gradient(135deg,${brand} 0%, ${shadeColor(brand, 12)} 55%, ${shadeColor(brand, 28)} 100%)!important;} .bg-brand,.btn-primary,.kpi-brand{background:${brand}!important;} .text-brand-700,.text-brand-600{color:${brand}!important;} .border-brand-500,.ring-brand-500{border-color:${brand};}`;

  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <style dangerouslySetInnerHTML={{ __html: brandStyle }} />
      </head>
      <body className="font-sans">
        <GlobeProvider>
        <header className="app-header no-print">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <a href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute inset-0 rounded-xl bg-brand-gold blur-md opacity-30 group-hover:opacity-50 transition" />
                <Logo size={40} className="relative drop-shadow" />
              </div>
              <div className="leading-tight">
                <div className="font-display font-bold text-white text-[15px] tracking-tight">
                  Cheapflight <span className="text-brand-gold">Tracker</span>
                </div>
                <div className="text-[11px] text-white/60 tracking-wide uppercase">
                  Live fares · 700+ airlines · alerts when prices drop
                </div>
              </div>
            </a>
            <div className="flex items-center gap-2">
              <CommandPalette />
              <NavLinks />
              <div className="hidden md:block w-px h-6 bg-white/15 mx-1" />
              <HeaderControls />
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8 pb-24 md:pb-8">{children}</main>

        <footer className="max-w-7xl mx-auto px-6 py-8 text-xs text-slate-500 no-print border-t border-slate-200/60 dark:border-slate-800 mt-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <span className="font-semibold text-slate-700 dark:text-slate-300">Cheapflight Tracker</span>
              {' '}· Data via Travelpayouts (Aviasales) · Cached, polled on schedule
            </div>
            <div className="text-slate-400">
              Booking deep-links route through Aviasales → egyptair.com
            </div>
          </div>
        </footer>
        <ChatWidget />
        <GlobeHUD />
        <CompareTray />
        <MobileBottomNav />
        </GlobeProvider>
      </body>
    </html>
  );
}

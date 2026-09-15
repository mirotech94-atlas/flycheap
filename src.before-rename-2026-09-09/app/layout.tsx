import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans, Fraunces, Manrope } from 'next/font/google';
import './globals.css';
import { GlobeProvider } from '@/lib/globeStore';
import { ClientChrome, AdminAwareMain, HideOnEmbed } from '@/components/ClientChrome';
import { ClientSidebar } from '@/components/ClientSidebar';
import { FcTweaks } from '@/components/FcTweaks';
import { DeferredAppWidgets } from '@/components/DeferredAppWidgets';
import { UserTelemetry } from '@/components/UserTelemetry';
import { getActiveTenant } from '@/lib/tenant';
import { getCurrentUser, isOwner } from '@/lib/auth';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const display = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display', display: 'swap', weight: ['500','600','700','800'] });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap', weight: ['400', '500', '700'] });
// Fraunces — distinctive, professional editorial serif (replaces Instrument Serif).
// Variable axes default to WONK=0/SOFT=0 for a clean, executive cut; weights 400
// (display headlines), 600 (emphasis), 900 (hero impact). Italic carries the gold accents.
const fcDisplay = Fraunces({
  subsets: ['latin'],
  variable: '--font-fc-display',
  display: 'swap',
  weight: ['400', '600', '900'],
  style: ['normal', 'italic'],
});
const fcSans = Manrope({ subsets: ['latin'], variable: '--font-fc-sans', display: 'swap', weight: ['400','500','600','700'] });

export const metadata: Metadata = {
  title: 'FlyCheap Tracker — Executive Dashboard',
  description: 'Cheap flights, monitored for you. Track 1,000+ airlines, get email alerts when fares drop.',
  applicationName: 'FlyCheap Tracker',
  appleWebApp: {
    capable: true,
    title: 'FlyCheap',
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
    var root = document.documentElement;
    // FC dropdown theme (Ivory / Paper / Coal) — global, applied before paint.
    var fcT = localStorage.getItem('fc-theme') || 'ivory';
    var fcA = localStorage.getItem('fc-accent') || 'gold';
    root.setAttribute('data-fc-theme', fcT);
    root.setAttribute('data-fc-accent', fcA);
    // Coal flips Tailwind dark mode too so non-FC routes (Settings, Searches…)
    // also re-skin instead of looking out of place against the rest of the app.
    if (fcT === 'coal') { root.classList.add('dark'); }
    else {
      var t = localStorage.getItem('egyptair-theme');
      if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        root.classList.add('dark');
      }
    }
  } catch(e) {}
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-tenant brand color (white-label) — apply at the root via inline CSS var.
  // Falls back to the default navy when the user hasn't set one.
  const user = await getActiveTenant();
  const sessionUser = await getCurrentUser();
  // Owner-only — non-owner admins (support / ops) don't see the portal affordance.
  const showAdminLink = isOwner(sessionUser);
  const brand = user?.brand_color || '#0a3a6b';
  const brandStyle = `:root{--brand:${brand};--brand-rgb:${hexToRgb(brand)};} .bg-brand-gradient{background:linear-gradient(135deg,${brand} 0%, ${shadeColor(brand, 12)} 55%, ${shadeColor(brand, 28)} 100%)!important;} .bg-brand,.btn-primary,.kpi-brand{background:${brand}!important;} .text-brand-700,.text-brand-600{color:${brand}!important;} .border-brand-500,.ring-brand-500{border-color:${brand};}`;

  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable} ${fcDisplay.variable} ${fcSans.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <style dangerouslySetInnerHTML={{ __html: brandStyle }} />
      </head>
      <body className="font-sans">
        <UserTelemetry />
        <GlobeProvider>
        <ClientChrome>
          <ClientSidebar
            user={sessionUser ? { email: sessionUser.email, name: sessionUser.name, tier: sessionUser.tier } : null}
            isAdmin={showAdminLink}
          />
        </ClientChrome>

        <AdminAwareMain>{children}</AdminAwareMain>

        <ClientChrome>
        <footer className="max-w-7xl mx-auto px-6 py-8 text-xs text-slate-500 no-print border-t border-slate-200/60 dark:border-slate-800 mt-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <span className="font-semibold text-slate-700 dark:text-slate-300">FlyCheap Tracker</span>
              {' '}· Data via Travelpayouts (Aviasales), Duffel &amp; Google Flights · Cached, polled on schedule
            </div>
            <div className="text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
              <span>Some Book links are affiliate links — we may earn a commission at no extra cost to you.</span>
              <a href="/about#affiliate-partners" className="underline">Disclosure</a>
              <a href="/terms" className="underline">Terms</a>
              <a href="/privacy" className="underline">Privacy</a>
            </div>
          </div>
        </footer>
        <DeferredAppWidgets />
        </ClientChrome>
        {/* FcTweaks lives OUTSIDE ClientChrome so the theme toggle is also
            available on admin routes — letting the user re-skin the whole
            app from anywhere. Hidden in mobile-app embed mode. */}
        <HideOnEmbed>
          <FcTweaks />
        </HideOnEmbed>
        </GlobeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans, Fraunces, Manrope, Archivo, Public_Sans, Newsreader, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { GlobeProvider } from '@/lib/globeStore';
import { contrastSafe, hexToRgbTriple } from '@/lib/brandContrast';
import { headers } from 'next/headers';
import { ClientChrome, AdminAwareMain, HideOnEmbed } from '@/components/ClientChrome';
import { ClientSidebar } from '@/components/ClientSidebar';
import { FcTweaks } from '@/components/FcTweaks';
import { DeferredAppWidgets } from '@/components/DeferredAppWidgets';
import { UserTelemetry } from '@/components/UserTelemetry';
import { getActiveTenant } from '@/lib/tenant';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { MARKETING_HOSTS } from '@/lib/hosts';
import { readThemeCookie } from '@/lib/theme';
import { getRequestLocaleInfo } from '@/lib/i18n/server';
import { getAppDict } from '@/lib/i18n/app';
import { AppI18nProvider } from '@/lib/i18n/client';

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
// Night-cabin display face: airport-signage width and weight. Used for route
// codes and page titles so a departure board reads like one.
const cabinDisplay = Archivo({
  subsets: ['latin'], variable: '--font-cabin', display: 'swap',
  weight: ['500', '600', '700', '800'],
});
const fcSans = Manrope({ subsets: ['latin'], variable: '--font-fc-sans', display: 'swap', weight: ['400','500','600','700'] });
// Editorial redesign faces (docs/design/handoff/README.md "Type").
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap', weight: ['400', '500', '600', '700'] });
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', display: 'swap', weight: ['300', '400', '500'] });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], variable: '--font-plex-mono', display: 'swap', weight: ['400', '500'] });

export const metadata: Metadata = {
  title: 'FlyCheap — Executive Dashboard',
  description: 'Cheap flights, monitored for you. Track 1,000+ airlines, get email alerts when fares drop.',
  applicationName: 'FlyCheap',
  appleWebApp: {
    capable: true,
    title: 'FlyCheap',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport = {
  // The browser/phone chrome tint. Still the retired navy while every surface
  // behind it had moved to the cabin ground, so the status bar did not match
  // the page under it.
  themeColor: '#0B1220',
  width: 'device-width',
  initialScale: 1,
};

// Color helpers — used to build the brand gradient at request time so each
// tenant's chosen color flows through the layout without runtime JS.
// The ground every tenant ink is measured against (--nc-dark).
const NC_DARK = '#0B1220';
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
    var t = (document.cookie.match(/(?:^|;\\s*)fc-theme=([^;]*)/) || [])[1];
    if (t !== 'light') t = 'dark';
    var root = document.documentElement;
    root.dataset.theme = t;
    root.classList.toggle('dark', t === 'dark');
  } catch (e) {}
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-tenant brand color (white-label) — apply at the root via inline CSS var.
  // Falls back to the default navy when the user hasn't set one.
  const user = await getActiveTenant();
  const sessionUser = await getCurrentUser();
  // Owner-only — non-owner admins (support / ops) don't see the portal affordance.
  const showAdminLink = isOwner(sessionUser);
  // Kept in step with tailwind's `brand.DEFAULT` on purpose -- these are two
  // separate literals for one idea ("the house blue"), and letting them drift
  // means `bg-brand/10` and the injected `.border-brand-500` stop matching.
  // Both moved off the retired Bloomberg navy together.
  const brand = user?.brand_color || '#1A4459';
  // Tenant ink, made legible WITHOUT being thrown away. The raw hex used to go
  // straight into the text roles, where a dark brand (including this default)
  // measured 1.55:1 on the cabin ground; the stopgap was a blanket override
  // that painted them all teal, i.e. it fixed legibility by discarding the
  // tenant's branding. contrastSafe keeps their HUE and moves only lightness
  // until it clears AA, and returns the colour untouched when it already does.
  //
  // Only the TEXT roles are derived. A brand-coloured background already picks
  // its own ink to contrast, so deriving it would change the design rather than
  // rescue it -- the cabin overrides in globals.css handle those.
  const brandInk = contrastSafe(brand, NC_DARK);
  const brandStyle = `:root{--brand:${brand};--brand-rgb:${hexToRgbTriple(brand)};--brand-ink:${brandInk};} .bg-brand-gradient{background:linear-gradient(135deg,${brand} 0%, ${shadeColor(brand, 12)} 55%, ${shadeColor(brand, 28)} 100%)!important;} .bg-brand,.btn-primary,.kpi-brand{background:${brand}!important;} .text-brand-700,.text-brand-600,.text-brand{color:${brandInk}!important;} .border-brand-500,.ring-brand-500{border-color:${brand};}`;

  // UI locale: fc_lang cookie → Accept-Language → en. Drives <html lang dir>,
  // an extra Google font for Arabic / Chinese / Devanagari, and the nav
  // dictionary handed to client chrome via context.
  // The admin subdomain is served by a middleware REWRITE (/ -> /admin), which
  // leaves the browser URL unchanged — so client components cannot detect it
  // from the pathname. Resolve it here, on the server, where the real Host
  // header is available, and pass it down.
  const hdrs = await headers();
  const reqHost = (hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? '').toLowerCase();
  const isAdminHost = reqHost.startsWith('admin.');
  // Same host-derived approach as isAdminHost above: the marketing-host rewrite
  // (/ -> /welcome) leaves the browser URL unchanged, so client components
  // cannot detect it from the pathname. Resolve it here from the real Host
  // header and pass it down so ClientChrome can render the landing bare.
  const hostNoPort = reqHost.split(':')[0];
  const isMarketingHost = MARKETING_HOSTS.has(hostNoPort);
  const theme = readThemeCookie(hdrs.get('cookie'));

  const { locale, dir, font } = await getRequestLocaleInfo();
  const t = getAppDict(locale);

  return (
    <html lang={locale} dir={dir} data-theme={theme} className={`${theme === 'dark' ? 'dark ' : ''}${inter.variable} ${display.variable} ${mono.variable} ${fcDisplay.variable} ${fcSans.variable} ${cabinDisplay.variable} ${publicSans.variable} ${newsreader.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <style dangerouslySetInnerHTML={{ __html: brandStyle }} />
        {font && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${font}&display=swap`} />}
      </head>
      <body className="font-sans">
        <AppI18nProvider value={{ locale, dir, nav: t.nav }}>
        <UserTelemetry />
        <GlobeProvider>
        <ClientChrome adminHost={isAdminHost} marketingHost={isMarketingHost}>
          <ClientSidebar
            user={sessionUser ? { email: sessionUser.email, name: sessionUser.name, tier: sessionUser.tier } : null}
            isAdmin={showAdminLink}
            language={t.common.language}
          />
        </ClientChrome>

        <AdminAwareMain adminHost={isAdminHost} marketingHost={isMarketingHost}>{children}</AdminAwareMain>

        <ClientChrome adminHost={isAdminHost} marketingHost={isMarketingHost}>
        <footer className="max-w-7xl mx-auto px-6 py-8 text-xs text-slate-500 no-print border-t border-slate-200/60 dark:border-slate-800 mt-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <span className="font-semibold text-slate-700 dark:text-slate-300">FlyCheap</span>
              {' '}· Data via Travelpayouts (Aviasales), Duffel &amp; Google Flights · Cached, polled on schedule
            </div>
            <div className="text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
              <span>Some Book links are affiliate links — we may earn a commission at no extra cost to you.</span>
              <a href="/about#affiliate-partners" className="underline">Disclosure</a>
              <a href="/terms" className="underline">Terms</a>
              <a href="/privacy" className="underline">Privacy</a>
              <a href="/credits" className="underline">Photo credits</a>
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
        </AppI18nProvider>
      </body>
    </html>
  );
}

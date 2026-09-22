import type { Metadata } from 'next';
import { Public_Sans, Newsreader, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { GlobeProvider } from '@/lib/globeStore';
import { contrastSafe, hexToRgbTriple, BRAND_GROUNDS } from '@/lib/brandContrast';
import { headers } from 'next/headers';
import { ClientChrome, AdminAwareMain } from '@/components/ClientChrome';
import { PortalTopBar } from '@/components/PortalTopBar';
import { DeferredAppWidgets } from '@/components/DeferredAppWidgets';
import { UserTelemetry } from '@/components/UserTelemetry';
import { getActiveTenant } from '@/lib/tenant';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { MARKETING_HOSTS } from '@/lib/hosts';
import { readThemeCookie } from '@/lib/theme';
import { getRequestLocaleInfo } from '@/lib/i18n/server';
import { getAppDict } from '@/lib/i18n/app';
import { AppI18nProvider } from '@/lib/i18n/client';

// Editorial redesign faces (docs/design/handoff/README.md "Type") — the only
// three faces the app serves. Legacy font-variable names (--font-sans,
// --font-display, --font-mono, --font-fc-display, --font-fc-sans,
// --font-cabin) are re-pointed to these in src/app/editorial.css.
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
  // The browser/phone chrome tint — now the editorial dark ground, matching
  // the page under it instead of the retired navy.
  themeColor: BRAND_GROUNDS.dark,
  width: 'device-width',
  initialScale: 1,
};

// The two grounds every tenant ink is measured against — the editorial
// system's `--bg` in each theme (BRAND_GROUNDS, src/lib/brandContrast.ts).

const themeBoot = `
  try {
    var t = (document.cookie.match(/(?:^|;\\s*)fc-theme=([^;]*)/) || [])[1];
    if (t !== 'light') t = 'dark';
    // Dark-only on the marketing host: the server already rendered dark, so
    // honouring a light cookie here would repaint the page a moment later.
    if (document.documentElement.classList.contains('mk-host')) t = 'dark';
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
  // The editorial system swaps `--bg` per theme (light on :root, dark under
  // html[data-theme="dark"]), so the ink has to be derived against BOTH
  // grounds and selected the same way -- a value derived only against the
  // dark ground would under- or over-shoot once the reader flips to light.
  //
  // Only the TEXT roles are derived. A brand-coloured background already picks
  // its own ink to contrast, so deriving it would change the design rather than
  // rescue it -- the cabin overrides in globals.css handle those.
  const brandInkLight = contrastSafe(brand, BRAND_GROUNDS.light);
  const brandInkDark = contrastSafe(brand, BRAND_GROUNDS.dark);
  const brandStyle = `:root{--brand:${brand};--brand-rgb:${hexToRgbTriple(brand)};--brand-ink-light:${brandInkLight};--brand-ink-dark:${brandInkDark};--brand-ink:${brandInkLight};} html[data-theme="dark"]{--brand-ink:${brandInkDark};} .bg-brand-gradient{background:${brand}!important;} .bg-brand,.btn-primary,.kpi-brand{background:${brand}!important;} .text-brand-700,.text-brand-600,.text-brand{color:var(--brand-ink)!important;} .border-brand-500,.ring-brand-500{border-color:${brand};}`;

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
  // The marketing site is dark only — Myron's call. Forcing it here rather
  // than hiding the control alone means a visitor who set light elsewhere
  // (the cookie is shared across the hosts) still gets the intended look,
  // and the portal keeps its choice.
  const theme = isMarketingHost ? 'dark' : readThemeCookie(hdrs.get('cookie'));

  const { locale, dir, font } = await getRequestLocaleInfo();
  const t = getAppDict(locale);

  return (
    <html lang={locale} dir={dir} data-theme={theme} className={`${theme === 'dark' ? 'dark ' : ''}${isMarketingHost ? 'mk-host ' : ''}${publicSans.variable} ${newsreader.variable} ${plexMono.variable}`}>
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
          <PortalTopBar
            user={sessionUser ? { email: sessionUser.email, name: sessionUser.name, tier: sessionUser.tier } : null}
            isAdmin={showAdminLink}
            language={t.common.language}
          />
        </ClientChrome>

        <AdminAwareMain adminHost={isAdminHost} marketingHost={isMarketingHost}>{children}</AdminAwareMain>

        <ClientChrome adminHost={isAdminHost} marketingHost={isMarketingHost}>
        <footer className="ed-footer no-print">
          <div className="ed-footer-row">
            <div>
              <span className="ed-footer-brand">FlyCheap</span>
              {' '}· Data via Travelpayouts (Aviasales), Duffel &amp; Google Flights · Cached, polled on schedule
            </div>
            <div className="ed-footer-links">
              <span>Some Book links are affiliate links — we may earn a commission at no extra cost to you.</span>
              <a href="/about#affiliate-partners">Disclosure</a>
              <a href="/terms">Terms</a>
              <a href="/privacy">Privacy</a>
              <a href="/credits">Photo credits</a>
            </div>
          </div>
        </footer>
        <DeferredAppWidgets />
        </ClientChrome>
        </GlobeProvider>
        </AppI18nProvider>
      </body>
    </html>
  );
}

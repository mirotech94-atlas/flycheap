'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Full-bleed routes own their entire chrome (their own top bar + footer) and
// must NOT get the client app sidebar / footer / widgets layered on top.
// /admin = command-center shell; /welcome = standalone marketing landing.
function isFullBleed(pathname: string | null, adminHost = false, marketingHost = false): boolean {
  // On admin.flycheap.live the middleware REWRITES / -> /admin. A rewrite
  // does not change the browser URL, so usePathname() here still reports "/"
  // and every admin page got the client sidebar layered on top of it. The
  // host is the only reliable signal on the client, and it is passed down
  // from the server layout so there is no hydration mismatch.
  if (adminHost) return true;
  // Same story on the marketing host: middleware REWRITES / -> /welcome, so
  // usePathname() still reports "/" and the landing rendered inside the app
  // shell (sidebar etc). Treat it exactly like the /welcome full-bleed case.
  if (marketingHost) return true;
  return (
    !!pathname &&
    (pathname.startsWith('/admin') ||
      pathname === '/welcome' ||
      pathname.startsWith('/welcome/') ||
      pathname === '/early-access' ||
      pathname.startsWith('/early-access/'))
  );
}

/**
 * `?embed=1` — the FlyCheap mobile app loads web screens (e.g. /explore) in a
 * WebView and passes embed=1 so we strip the web nav/footer/widgets and it reads
 * as a native screen (no double tab bar). Read at mount via location to avoid the
 * useSearchParams() Suspense/static-export constraints across the whole app shell.
 */
export function useIsEmbed(): boolean {
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    try {
      setEmbed(new URLSearchParams(window.location.search).get('embed') === '1');
    } catch {
      /* noop */
    }
  }, []);
  return embed;
}

/**
 * Hides the client app chrome (sidebar / footer / ChatWidget / GlobeHUD / etc.)
 * on full-bleed routes (/admin/* and /welcome) and in mobile-app embed mode.
 */
export function ClientChrome({ children, adminHost, marketingHost }: { children: React.ReactNode; adminHost?: boolean; marketingHost?: boolean }) {
  const pathname = usePathname();
  const embed = useIsEmbed();
  if (isFullBleed(pathname, adminHost, marketingHost) || embed) return null;
  return <>{children}</>;
}

/** Hides children only in mobile-app embed mode. */
export function HideOnEmbed({ children }: { children: React.ReactNode }) {
  const embed = useIsEmbed();
  if (embed) return null;
  return <>{children}</>;
}

/**
 * Hides children on FC-design routes (`/` dashboard + `/welcome`) where the
 * editorial design already includes its own globe/concierge treatments. Used
 * to suppress the legacy GlobeHUD floating panel which renders a black/empty
 * globe over the new design.
 */
export function HideOnFcRoutes({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/' || pathname === '/welcome' || pathname?.startsWith('/welcome/') || pathname === '/early-access' || pathname?.startsWith('/early-access/')) return null;
  return <>{children}</>;
}

/** Variant that swaps className when on /admin/* so the root <main> stops
 *  imposing its max-w-7xl + padding on the admin portal. On client routes,
 *  chrome now lives in the sticky PortalTopBar rather than a fixed-width
 *  left rail, so <main> needs no sidebar gutter — content just gets the
 *  editorial page padding (.ed-page) and fills the viewport edge-to-edge. */
export function AdminAwareMain({ children, adminHost, marketingHost }: { children: React.ReactNode; adminHost?: boolean; marketingHost?: boolean }) {
  const pathname = usePathname();
  const embed = useIsEmbed();
  // Full-bleed routes (admin + welcome) and mobile-app embed mode render
  // edge-to-edge with no sidebar gutter and no imposed padding.
  if (isFullBleed(pathname, adminHost, marketingHost) || embed) {
    return <main className="min-h-screen">{children}</main>;
  }
  return (
    <main className="min-h-screen w-full">
      <div className="ed-page">{children}</div>
    </main>
  );
}

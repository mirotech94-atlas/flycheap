'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Full-bleed routes own their entire chrome (their own top bar + footer) and
// must NOT get the client app sidebar / footer / widgets layered on top.
// /admin = command-center shell; /welcome = standalone marketing landing.
function isFullBleed(pathname: string | null): boolean {
  return (
    !!pathname &&
    (pathname.startsWith('/admin') ||
      pathname === '/welcome' ||
      pathname.startsWith('/welcome/'))
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
export function ClientChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const embed = useIsEmbed();
  if (isFullBleed(pathname) || embed) return null;
  return <>{children}</>;
}

/** Hides children only in mobile-app embed mode (e.g. the FcTweaks theme picker
 *  which renders outside ClientChrome). */
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
  if (pathname === '/' || pathname === '/welcome' || pathname?.startsWith('/welcome/')) return null;
  return <>{children}</>;
}

/** Variant that swaps className when on /admin/* so the root <main> stops
 *  imposing its max-w-7xl + padding on the admin portal. On client routes,
 *  shifts content right by 220px to make room for the fixed client sidebar
 *  AND fills the entire viewport edge-to-edge — no centered max-width
 *  gutter (mirrors the admin shell). */
export function AdminAwareMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const embed = useIsEmbed();
  // Full-bleed routes (admin + welcome) and mobile-app embed mode render
  // edge-to-edge with no sidebar gutter and no imposed padding.
  if (isFullBleed(pathname) || embed) {
    return <main className="min-h-screen">{children}</main>;
  }
  return (
    <main className="md:pl-[220px] min-h-screen w-full">
      <div className="px-6 md:px-10 py-8 pb-24 md:pb-8 w-full">{children}</div>
    </main>
  );
}

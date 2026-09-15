'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Silently re-runs the server component every {intervalMs} ms so the
 * dashboard's Live Feed picks up new polls without a manual refresh.
 * Pauses while the tab is hidden to avoid burning fetches in background tabs.
 */
export function LiveFeedRefresher({ intervalMs = 45_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') router.refresh();
      }, intervalMs);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    start();
    const onVis = () => { if (document.visibilityState === 'visible') start(); else stop(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [router, intervalMs]);
  return null;
}

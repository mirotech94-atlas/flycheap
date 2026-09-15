'use client';

import { useEffect, useRef } from 'react';
import { useToast } from './Toaster';
import { useRouter } from 'next/navigation';

/**
 * Mount once near the root. Opens a long-lived /api/events EventSource and
 * fires a toast on each new snapshot/alert for the signed-in user.
 *
 * - Auto-reconnects (EventSource is built for that).
 * - Throttles snapshot toasts so a poll storm doesn't flood the UI.
 * - Triggers a router.refresh() when a new alert lands so server-rendered
 *   tables pick up the change without a manual reload.
 */
export function LiveEvents() {
  const toast = useToast();
  const router = useRouter();
  const lastSnapMs = useRef<Record<number, number>>({});
  const lastSnapPrice = useRef<Record<number, number>>({});

  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;

    function open() {
      if (stopped) return;
      es = new EventSource('/api/events');

      es.addEventListener('snapshot', (e) => {
        try {
          const s = JSON.parse((e as MessageEvent).data) as {
            id: number; search_id: number; origin: string; destination: string;
            price_per_adult_usd: number; polled_at: string;
          };
          // Throttle: at most one snapshot toast per search per 60s, and only
          // when the price has actually moved more than $1 vs. the previous
          // notification — we don't want every routine 5-min poll to toast.
          const now = Date.now();
          const last = lastSnapMs.current[s.search_id] ?? 0;
          const lastPrice = lastSnapPrice.current[s.search_id];
          if (now - last < 60_000) return;
          if (lastPrice && Math.abs(lastPrice - s.price_per_adult_usd) < 1) return;
          lastSnapMs.current[s.search_id] = now;
          const direction = lastPrice ? (s.price_per_adult_usd < lastPrice ? '↓' : '↑') : '·';
          lastSnapPrice.current[s.search_id] = s.price_per_adult_usd;
          toast.info(
            `${direction} ${s.origin} → ${s.destination} · $${Math.round(s.price_per_adult_usd)}/adult`,
            'Live poll just landed.',
          );
        } catch { /* ignore parse */ }
      });

      es.addEventListener('alert', (e) => {
        try {
          const a = JSON.parse((e as MessageEvent).data) as {
            kind: string | null; origin: string; destination: string; price_per_adult_usd: number;
          };
          const kindLabel = a.kind === 'mistake-fare' ? '🚨 Mistake fare'
                          : a.kind === 'price-drop'   ? '📉 Price drop'
                          : '✈ Alert fired';
          toast.success(
            `${kindLabel} · ${a.origin} → ${a.destination}`,
            `$${Math.round(a.price_per_adult_usd)}/adult — check your inbox.`,
          );
          // Server-rendered tables (Watchlist, /admin) refresh in place.
          router.refresh();
        } catch { /* ignore parse */ }
      });

      // Reconnect on hard error after a short delay. EventSource already
      // handles transient drops, but a 401/closed stream needs help.
      es.onerror = () => {
        if (!es) return;
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          setTimeout(open, 5_000);
        }
      };
    }

    open();
    return () => { stopped = true; es?.close(); };
  }, [toast, router]);

  return null;
}

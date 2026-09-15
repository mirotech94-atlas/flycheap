'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

type TelemetryEvent = {
  t: string;
  path?: string;
  target?: string;
  value?: string;
  x?: number;
  y?: number;
  moveCount?: number;
  durationMs?: number;
  detail?: unknown;
};

const MAX_BATCH = 30;
const FLUSH_MS = 2500;

function sessionId(): string {
  const key = 'flycheap.telemetry.session';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function pathNow(): string {
  try {
    return window.location.pathname + window.location.search;
  } catch {
    return '';
  }
}

function elementLabel(el: Element | null): string {
  if (!el) return '';
  const node = el.closest('button,a,input,select,textarea,label,[role="button"],[data-telemetry]');
  if (!node) return el.tagName.toLowerCase();
  const tag = node.tagName.toLowerCase();
  const attr = (name: string) => node.getAttribute(name);
  const bits = [
    tag,
    attr('data-telemetry'),
    attr('aria-label'),
    attr('name'),
    attr('id') ? `#${attr('id')}` : '',
    attr('href') ? `href:${attr('href')}` : '',
  ].filter(Boolean);
  const text = node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (text && tag !== 'input' && tag !== 'textarea') bits.push(`text:${text}`);
  return bits.join(' ');
}

function fieldValue(el: Element | null): string | undefined {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    return undefined;
  }
  if (el instanceof HTMLInputElement && (el.type === 'password' || el.type === 'email')) {
    return `[${el.type}]`;
  }
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    return String(el.checked);
  }
  return el.value.slice(0, 120);
}

function send(session: string, events: TelemetryEvent[]) {
  if (events.length === 0) return;
  const body = JSON.stringify({ sessionId: session, events });
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/telemetry', blob)) return;
    }
  } catch {
    /* fall through to fetch */
  }
  fetch('/api/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function UserTelemetry() {
  const pathname = usePathname();
  const sessionRef = useRef<string>('');
  const queueRef = useRef<TelemetryEvent[]>([]);
  const moveCountRef = useRef(0);
  const lastMoveSampleRef = useRef(0);

  useEffect(() => {
    sessionRef.current = sessionId();
    const startedAt = Math.round(performance.now());

    const flush = () => {
      const batch = queueRef.current.splice(0, MAX_BATCH);
      send(sessionRef.current, batch);
    };

    const record = (event: TelemetryEvent) => {
      queueRef.current.push({ path: pathNow(), ...event });
      if (queueRef.current.length >= MAX_BATCH) flush();
    };

    record({
      t: 'page_view',
      durationMs: startedAt,
      detail: {
        referrer: document.referrer || null,
        viewport: { w: window.innerWidth, h: window.innerHeight },
      },
    });

    const onPointerMove = (ev: PointerEvent) => {
      moveCountRef.current += 1;
      const now = performance.now();
      if (now - lastMoveSampleRef.current < 250) return;
      lastMoveSampleRef.current = now;
      const moveCount = moveCountRef.current;
      moveCountRef.current = 0;
      record({
        t: 'pointer_move',
        x: Math.round(ev.clientX),
        y: Math.round(ev.clientY),
        moveCount,
        target: elementLabel(ev.target instanceof Element ? ev.target : null),
      });
    };

    const onClick = (ev: MouseEvent) => {
      record({
        t: 'click',
        x: Math.round(ev.clientX),
        y: Math.round(ev.clientY),
        target: elementLabel(ev.target instanceof Element ? ev.target : null),
      });
    };

    const onChange = (ev: Event) => {
      const el = ev.target instanceof Element ? ev.target : null;
      record({
        t: 'change',
        target: elementLabel(el),
        value: fieldValue(el),
      });
    };

    const onSubmit = (ev: SubmitEvent) => {
      record({
        t: 'submit',
        target: elementLabel(ev.target instanceof Element ? ev.target : null),
      });
    };

    const onVisibility = () => {
      record({ t: document.visibilityState === 'hidden' ? 'page_hidden' : 'page_visible' });
      if (document.visibilityState === 'hidden') flush();
    };

    const onError = (ev: ErrorEvent) => {
      record({
        t: 'client_error',
        target: ev.filename ? `${ev.filename}:${ev.lineno}` : undefined,
        value: ev.message?.slice(0, 200),
      });
      flush();
    };

    const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
      record({
        t: 'unhandled_rejection',
        value: String(ev.reason ?? '').slice(0, 200),
      });
      flush();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('click', onClick, { capture: true, passive: true });
    window.addEventListener('change', onChange, { capture: true });
    window.addEventListener('submit', onSubmit, { capture: true });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    const interval = window.setInterval(flush, FLUSH_MS);

    return () => {
      window.clearInterval(interval);
      flush();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('change', onChange, { capture: true });
      window.removeEventListener('submit', onSubmit, { capture: true });
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  useEffect(() => {
    if (!sessionRef.current) return;
    send(sessionRef.current, [{
      t: 'route_change',
      path: pathNow(),
      detail: { pathname, query: window.location.search },
    }]);
  }, [pathname]);

  useEffect(() => {
    if (!sessionRef.current || !('PerformanceObserver' in window)) return;
    const observers: PerformanceObserver[] = [];
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (nav) {
        send(sessionRef.current, [{
          t: 'navigation_timing',
          path: pathNow(),
          durationMs: Math.round(nav.duration),
          detail: {
            dom: Math.round(nav.domContentLoadedEventEnd),
            load: Math.round(nav.loadEventEnd),
            ttfb: Math.round(nav.responseStart),
          },
        }]);
      }

      const resourceObserver = new PerformanceObserver(list => {
        const slow = list.getEntries()
          .filter(entry => entry.duration > 1000)
          .slice(0, 8)
          .map(entry => ({
            t: 'slow_resource',
            path: pathNow(),
            target: entry.name.slice(0, 160),
            durationMs: Math.round(entry.duration),
          }));
        if (slow.length > 0) send(sessionRef.current, slow);
      });
      resourceObserver.observe({ type: 'resource', buffered: true });
      observers.push(resourceObserver);
    } catch {
      /* unsupported browser or restricted performance entry */
    }
    return () => {
      for (const observer of observers) observer.disconnect();
    };
  }, []);

  return null;
}

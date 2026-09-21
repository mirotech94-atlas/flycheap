'use client';

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';

type ToastKind = 'success' | 'info' | 'warn' | 'error';

export type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  durationMs?: number; // 0 = sticky
};

type Ctx = {
  toast: (t: Omit<Toast, 'id'> & { id?: number }) => number;
  success: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
  warn: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  dismiss: (id: number) => void;
};

const ToasterContext = createContext<Ctx | null>(null);

export function useToast(): Ctx {
  const ctx = useContext(ToasterContext);
  if (!ctx) {
    // Lazy fallback so component usage outside the provider doesn't crash —
    // it just logs to console. Keeps refactors safe.
    return {
      toast: (t) => { console.log('[toast]', t); return -1; },
      success: (t, d) => { console.log('[toast]', { kind: 'success', title: t, description: d }); return -1; },
      info:    (t, d) => { console.log('[toast]', { kind: 'info',    title: t, description: d }); return -1; },
      warn:    (t, d) => { console.log('[toast]', { kind: 'warn',    title: t, description: d }); return -1; },
      error:   (t, d) => { console.log('[toast]', { kind: 'error',   title: t, description: d }); return -1; },
      dismiss: () => {},
    };
  }
  return ctx;
}

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seqRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) { clearTimeout(tm); timers.current.delete(id); }
  }, []);

  const push = useCallback((t: Omit<Toast, 'id'> & { id?: number }): number => {
    const id = t.id ?? (++seqRef.current);
    const full: Toast = { kind: 'info', durationMs: 4200, ...t, id };
    setToasts(prev => [...prev, full]);
    if (full.durationMs && full.durationMs > 0) {
      const tm = setTimeout(() => dismiss(id), full.durationMs);
      timers.current.set(id, tm);
    }
    return id;
  }, [dismiss]);

  const value: Ctx = {
    toast: push,
    success: (t, d) => push({ kind: 'success', title: t, description: d }),
    info:    (t, d) => push({ kind: 'info',    title: t, description: d }),
    warn:    (t, d) => push({ kind: 'warn',    title: t, description: d }),
    error:   (t, d) => push({ kind: 'error',   title: t, description: d, durationMs: 7000 }),
    dismiss,
  };

  // Cross-component listener: any code can `window.dispatchEvent(new CustomEvent('toast', { detail: {...} }))`
  // and a toast appears. Useful from non-React contexts.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Partial<Toast> | undefined;
      if (detail?.title) push({ kind: detail.kind ?? 'info', title: detail.title, description: detail.description, durationMs: detail.durationMs });
    };
    window.addEventListener('toast', handler);
    return () => window.removeEventListener('toast', handler);
  }, [push]);

  return (
    <ToasterContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToasterContext.Provider>
  );
}

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none no-print"
      style={{ maxWidth: 'min(380px, calc(100vw - 32px))' }}
    >
      {toasts.map(t => (
        <ToastCard key={t.id} t={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>,
    document.body
  );
}

function ToastCard({ t, onClose }: { t: Toast; onClose: () => void }) {
  const accent = {
    success: { bar: 'var(--green)', icon: '✓' },
    info:    { bar: 'var(--accent)', icon: 'ℹ' },
    warn:    { bar: 'var(--amber)', icon: '!' },
    error:   { bar: 'var(--red)', icon: '×' },
  }[t.kind];
  const panelFg72 = 'color-mix(in srgb, var(--panel-fg) 72%, var(--panel-bg))';

  return (
    <div
      role="status"
      className="pointer-events-auto motion-slide-right relative overflow-hidden text-sm"
      style={{
        background: 'var(--panel-bg)',
        color: 'var(--panel-fg)',
        border: '1px solid var(--rule-strong)',
        borderRadius: 0,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
          background: accent.bar,
        }}
      />
      <div className="pl-4 pr-3 py-3 flex items-start gap-3">
        {/* The accent lives on the left rule (above) — the glyph itself
            stays panel-fg so it reads at full contrast in both themes
            rather than needing a fill colour that only works in one. */}
        <span
          aria-hidden="true"
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[13px] font-bold"
          style={{ color: 'var(--panel-fg)' }}
        >
          {accent.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold" style={{ color: 'var(--panel-fg)' }}>{t.title}</div>
          {t.description && (
            <div className="text-[12px] mt-0.5 break-words" style={{ color: panelFg72 }}>{t.description}</div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="ml-1 -mr-1 px-1 text-base leading-none"
          style={{ color: panelFg72 }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

// Helper: imperative toast-from-anywhere via custom event.
// Use from non-React contexts (handlers, vanilla JS, etc).
export function fireToast(t: { kind?: ToastKind; title: string; description?: string; durationMs?: number }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('toast', { detail: t }));
}

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
    success: { ring: 'rgba(16,185,129,0.55)', bar: '#10b981', icon: '✓' },
    info:    { ring: 'rgba(59,130,246,0.55)', bar: '#3b82f6', icon: 'ℹ' },
    warn:    { ring: 'rgba(245,158,11,0.55)', bar: '#f59e0b', icon: '!' },
    error:   { ring: 'rgba(239,68,68,0.55)',  bar: '#ef4444', icon: '×' },
  }[t.kind];

  return (
    <div
      role="status"
      className="pointer-events-auto motion-slide-right relative overflow-hidden rounded-xl shadow-lift backdrop-blur-md bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-700/60 text-sm"
      style={{
        boxShadow: `0 1px 0 ${accent.ring} inset, 0 18px 40px -16px rgba(0,0,0,.35)`,
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
        <span
          aria-hidden="true"
          className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
          style={{ background: accent.bar }}
        >
          {accent.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 dark:text-slate-100">{t.title}</div>
          {t.description && (
            <div className="text-[12px] text-slate-600 dark:text-slate-400 mt-0.5 break-words">{t.description}</div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="ml-1 -mr-1 px-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-base leading-none"
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

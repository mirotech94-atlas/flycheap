'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  requireText?: string; // user must type this to enable confirm
};

let resolver: ((value: boolean) => void) | null = null;
let setOptions: ((o: ConfirmOptions | null) => void) | null = null;

/**
 * Imperative confirm — Promise-based, replaces `window.confirm`.
 * Pairs with <ConfirmHost /> mounted once at the root.
 *
 *   if (await confirm({ title: 'Delete user?', destructive: true })) ...
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  if (!setOptions) {
    // Host not mounted — fall back to browser confirm so things still work.
    return Promise.resolve(window.confirm(opts.description || opts.title));
  }
  setOptions(opts);
  return new Promise<boolean>(resolve => { resolver = resolve; });
}

export function ConfirmHost() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Register the setter so the imperative `confirm()` can open us.
  useEffect(() => {
    setOptions = (o) => { setOpts(o); setTyped(''); };
    return () => { setOptions = null; };
  }, []);

  // ESC to cancel, autofocus cancel button when opening.
  useEffect(() => {
    if (!opts) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolve(false);
      if (e.key === 'Enter' && !opts.requireText) resolve(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);

  function resolve(v: boolean) {
    resolver?.(v);
    resolver = null;
    setOpts(null);
    setTyped('');
  }

  if (!opts) return null;
  const needsTyping = !!opts.requireText;
  const confirmDisabled = needsTyping && typed !== opts.requireText;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 motion-fade-in no-print"
      style={{ background: 'rgba(2,6,23,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) resolve(false); }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-lift border border-slate-200 dark:border-slate-700 overflow-hidden"
        style={{ background: 'var(--bg-card, #fff)' }}
      >
        <div className="px-5 pt-5 pb-3">
          <h2 id="confirm-title" className="text-lg font-bold text-slate-900 dark:text-slate-100 !mb-1">
            {opts.title}
          </h2>
          {opts.description && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{opts.description}</p>
          )}
          {needsTyping && (
            <label className="mt-4 block">
              <span className="text-xs text-slate-500">Type <code className="font-mono">{opts.requireText}</code> to confirm:</span>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="mt-1 w-full font-mono"
              />
            </label>
          )}
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => resolve(false)}
            className="btn btn-sm"
          >
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={() => resolve(true)}
            className={`btn btn-sm ${opts.destructive ? 'btn-danger' : 'btn-primary'}`}
          >
            {opts.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

'use client';

import { useState } from 'react';
import { AdminFarePilot } from './AdminFarePilot';

/**
 * Floating bottom-right launcher for the owner AI operator console. Mounted
 * once in the admin layout so it is reachable from every admin page instead
 * of occupying its own nav tab. The panel just hosts the existing
 * <AdminFarePilot> chat; all auth (owner + admin host + same-origin + TOTP
 * step-up) is enforced server-side in /api/admin/farepilot on every request,
 * so this is a pure presentation change.
 *
 * Trigger and panel reuse the editorial button/panel primitives ( `ed-btn
 * ed-btn-primary` / `ed-widget-panel` / `ed-widget-head*` — the panel is the
 * same shape as the client-facing ChatWidget.tsx's docked chat panel, just a
 * different console). Round 1 fix: the trigger keeps its visible "FarePilot"
 * / "Close" label (a control's visible label must never disappear) — it is
 * a 44px-tall pill with natural width, not the `ed-fab` 44×44 square
 * ChatWidget's own icon-only FAB uses.
 */
export function AdminFarePilotWidget({ totpEnabled }: { totpEnabled: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="ed-widget-panel fixed bottom-24 right-4 z-[60] w-[min(440px,94vw)]">
          <div className="ed-widget-head">
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">🛩️</span>
              <span className="ed-widget-head-title">FarePilot Admin</span>
              <span className="ed-widget-head-meta">operator</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close FarePilot"
              className="ed-widget-head-btn"
            >
              ×
            </button>
          </div>
          <div className="p-3">
            <AdminFarePilot totpEnabled={totpEnabled} />
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open FarePilot Admin"
        aria-expanded={open}
        className="ed-btn ed-btn-primary fixed bottom-5 right-5 z-[60] h-[44px]"
      >
        <span className="text-lg leading-none">🛩️</span>
        <span className="hidden text-sm font-semibold sm:inline">{open ? 'Close' : 'FarePilot'}</span>
      </button>
    </>
  );
}

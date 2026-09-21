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
 * Trigger and panel reuse the same primitives as the client-facing
 * ChatWidget.tsx FAB (`ed-btn ed-btn-primary ed-fab` / `ed-widget-panel` /
 * `ed-widget-head*`) — the shapes are identical (floating launcher + docked
 * chat panel), just a different console. The trigger's visible text label
 * is dropped (was a variable-width pill, incompatible with a true 44×44
 * square button); the accessible name carries it instead via `aria-label`.
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
        className="ed-btn ed-btn-primary ed-fab fixed bottom-5 right-5 z-[60]"
      >
        <span className="text-lg leading-none">🛩️</span>
      </button>
    </>
  );
}

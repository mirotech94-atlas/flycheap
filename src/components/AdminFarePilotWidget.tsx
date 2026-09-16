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
 */
export function AdminFarePilotWidget({ totpEnabled }: { totpEnabled: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-[60] w-[min(440px,94vw)]">
          <div className="overflow-hidden rounded-2xl border border-amber-400/30 bg-[#0e1d36] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 bg-[#0b1830] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none">🛩️</span>
                <span className="text-sm font-semibold text-white">FarePilot Admin</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-amber-400/70">operator</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close FarePilot"
                className="text-xl leading-none text-white/50 transition hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="p-3">
              <AdminFarePilot totpEnabled={totpEnabled} />
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open FarePilot Admin"
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 px-4 py-3 text-white shadow-xl transition hover:from-amber-400 hover:to-amber-500"
      >
        <span className="text-lg leading-none">🛩️</span>
        <span className="hidden text-sm font-semibold sm:inline">{open ? 'Close' : 'FarePilot'}</span>
      </button>
    </>
  );
}

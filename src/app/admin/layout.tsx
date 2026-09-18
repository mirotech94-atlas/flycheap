import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import { AdminSidebar } from './_components/AdminSidebar';
import { AdminBreadcrumb } from './_components/AdminBreadcrumb';
import { AdminFarePilotWidget } from '@/components/AdminFarePilotWidget';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const h = await headers();
  const nextPath = h.get('x-pathname') || '/admin';
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  // Founder-only portal. A signed-in NON-owner (e.g. a client session — the
  // session cookie is shared across *.flycheap.live) must NOT be bounced to the
  // marketing site: that traps them with no way to switch accounts. Send them to
  // the admin login form, which lets them sign in as the owner.
  if (!isOwner(user)) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  // Whether the owner has 2FA available for FarePilot step-up (SQL/shell).
  const farePilotTotpEnabled = (user.totp_enabled === 1 && !!user.totp_secret) || !!process.env.OWNER_TOTP_SECRET;

  return (
    <div
      className="admin-shell text-white"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'auto',
        background:
          'linear-gradient(180deg, #1B2740 0%, #0B1220 40%, #080D16 100%)',
      }}
    >
      <AdminSidebar email={user.email} />

      <div className="md:pl-[220px] min-h-screen flex flex-col">
        <header className="ad-glass-bar flex items-center justify-between px-6 py-3 sticky top-0 z-30">
          <div className="md:hidden flex items-center gap-2">
            <Logo size={28} />
            <span className="font-semibold text-sm">Admin</span>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">
              FlyCheap · Command Center
            </span>
            <span className="text-white/15">/</span>
            <AdminBreadcrumb />
            <span className="ad-env" title="You are viewing live production data">
              <span className="dot" />Live · production
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/30 hidden md:inline">
              Founder access
            </span>
          </div>
        </header>

        <main className="admin-main flex-1 px-6 py-6 md:px-10 md:py-8">
          <div className="admin-surface w-full">{children}</div>
        </main>
      </div>

      {/* Owner AI operator console — floating widget, reachable from every admin page. */}
      <AdminFarePilotWidget totpEnabled={farePilotTotpEnabled} />

      <style>{`
        /* ============================================================
           FlyCheap Admin — Executive Command-Center
           Always-dark cockpit on the NIGHT-CABIN token system (--nc-*). Restyles the
           shared primitives (.card / .eyebrow / h1-3 / tables / StatCard)
           so every admin page inherits the look from one place.
           ============================================================ */
        .admin-shell {
          --ad-panel:    #131C2E;
          --ad-panel-2:  #131C2E;
          --ad-line:     rgba(255,255,255,.09);
          --ad-line-soft:rgba(255,255,255,.055);
          --ad-gold:     #E8A33D;
          --ad-gold-soft:#F2C67A;
          --ad-text:     #E9EDF5;
          --ad-muted:    rgba(255,255,255,.56);
          --ad-faint:    rgba(255,255,255,.4);
          font-family: var(--fc-font-sans, 'Manrope', system-ui, sans-serif);
        }

        /* Atmospheric main surface — subtle grid + radial brand glows */
        .admin-shell .admin-main {
          background:
            radial-gradient(820px 480px at 90% -10%, rgba(232,163,61,.10), transparent 60%),
            radial-gradient(720px 480px at -6% 112%, rgba(111,179,201,.07), transparent 55%),
            #0B1220 !important;
          position: relative;
        }
        .admin-shell .admin-main::before {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.022) 1px, transparent 1px);
          background-size: 48px 48px;
          -webkit-mask-image: radial-gradient(ellipse at 50% 0%, #000 25%, transparent 78%);
                  mask-image: radial-gradient(ellipse at 50% 0%, #000 25%, transparent 78%);
        }
        .admin-shell .admin-surface { position: relative; z-index: 1; }

        /* Headings → Fraunces editorial */
        .admin-shell h1, .admin-shell h2, .admin-shell h3 {
          font-family: var(--fc-font-display, 'Fraunces', 'Times New Roman', serif) !important;
          color: #fff !important;
          letter-spacing: -.015em; font-weight: 600;
        }
        .admin-shell h1 { font-size: 2.05rem; line-height: 1.04; }
        .admin-shell h2 { font-size: 1.4rem; line-height: 1.1; }
        .admin-shell h3 { font-size: 1.1rem; }

        /* Eyebrow → gold mono smallcaps */
        .admin-shell .eyebrow {
          font-family: var(--fc-font-mono, 'JetBrains Mono', monospace) !important;
          color: var(--ad-gold) !important;
          font-size: 10px !important; letter-spacing: .2em; text-transform: uppercase; font-weight: 600;
        }

        /* Cards / KPI → cockpit panels with gold hairline + depth */
        .admin-shell .card,
        .admin-shell .kpi {
          /* Glass, matching the client portal and the marketing site: a lit top
             lip, a facing gradient, and blur+saturate so the page's own glows
             bloom through the panel instead of being covered by it. */
          background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.018)) !important;
          -webkit-backdrop-filter: blur(14px) saturate(160%);
          backdrop-filter: blur(14px) saturate(160%);
          border: 1px solid var(--ad-line) !important;
          border-radius: 16px !important;
          color: var(--ad-text) !important;
          box-shadow: 0 1px 0 rgba(255,255,255,.14) inset, 0 20px 44px -30px rgba(0,0,0,.85) !important;
          position: relative;
        }
        @supports not (backdrop-filter: blur(1px)) {
          .admin-shell .card,
          .admin-shell .kpi {
            background: linear-gradient(180deg, var(--ad-panel), var(--ad-panel-2)) !important;
          }
        }
        .admin-shell .card-elevated {
          border-color: rgba(232,163,61,.22) !important;
          background:
            linear-gradient(180deg, rgba(232,163,61,.05), transparent 40%),
            linear-gradient(180deg, var(--ad-panel), var(--ad-panel-2)) !important;
        }
        .admin-shell .card:hover { border-color: rgba(255,255,255,.14) !important; }

        /* Big stat numbers → JetBrains Mono terminal numerics */
        .admin-shell .card .text-2xl,
        .admin-shell .card .text-3xl,
        .admin-shell .tabular {
          font-family: var(--fc-font-mono, 'JetBrains Mono', monospace) !important;
          font-variant-numeric: tabular-nums;
          letter-spacing: -.01em;
        }
        .admin-shell .kpi-label { color: var(--ad-muted) !important; }
        .admin-shell .kpi-value { color: #fff !important; }
        .admin-shell .kpi-sub   { color: var(--ad-muted) !important; }
        .admin-shell .kpi-brand { background: linear-gradient(135deg,#1B2740,#3D6B86) !important; }

        /* Tables → hairline rows, mono headers, gold hover, green money */
        .admin-shell table thead th {
          font-family: var(--fc-font-mono, 'JetBrains Mono', monospace) !important;
          color: var(--ad-faint) !important;
          font-size: 9.5px !important; letter-spacing: .14em; text-transform: uppercase; font-weight: 600;
          border-bottom: 1px solid var(--ad-line) !important;
          padding-bottom: 8px;
        }
        .admin-shell table tbody td { color: rgba(255,255,255,.82); border-color: var(--ad-line-soft) !important; }
        .admin-shell table tbody tr { transition: background .12s; }
        .admin-shell table tbody tr:hover td { background: rgba(232,163,61,.05); }

        /* Inline code → gold chips */
        .admin-shell code {
          background: rgba(232,163,61,.1); color: var(--ad-gold-soft);
          padding: 1px 5px; border-radius: 4px; font-size: .85em;
          font-family: var(--fc-font-mono, 'JetBrains Mono', monospace);
        }

        /* Slate-utility remaps so Tailwind light classes read on dark */
        .admin-shell .text-slate-500,
        .admin-shell .text-slate-400,
        .admin-shell .text-slate-600 { color: var(--ad-muted) !important; }
        .admin-shell .text-slate-700,
        .admin-shell .text-slate-900,
        .admin-shell .text-slate-100,
        .admin-shell .text-slate-300 { color: #fff !important; }
        .admin-shell .bg-slate-100,
        .admin-shell .bg-slate-50 { background: rgba(255,255,255,.04) !important; }
        .admin-shell .border-slate-100,
        .admin-shell .border-slate-200,
        .admin-shell .border-slate-800 { border-color: var(--ad-line-soft) !important; }

        /* ============================================================
           Executive primitives (src/app/admin/_components/ui.tsx)
           ============================================================ */
        .admin-shell .ad-eyebrow {
          font-family: var(--fc-font-mono, ui-monospace, monospace);
          font-size: 9.5px; letter-spacing: .2em; text-transform: uppercase;
          line-height: 1.4;
        }
        .admin-shell .ad-panel {
          background: linear-gradient(180deg, var(--ad-panel) 0%, var(--ad-panel-2) 100%);
          border: 1px solid var(--ad-line);
          border-radius: 14px;
          padding: 16px 18px;
          position: relative;
          box-shadow: 0 18px 38px -28px rgba(0,0,0,.85);
        }
        .admin-shell .ad-panel-gold {
          border-color: rgba(232,163,61,.34);
          box-shadow: 0 0 0 1px rgba(232,163,61,.06), 0 18px 38px -28px rgba(0,0,0,.85);
        }
        .admin-shell .ad-panel-title {
          font-family: var(--fc-font-display, 'Fraunces', serif);
          font-size: 15px; color: #fff; letter-spacing: -.01em; font-weight: 600;
        }
        .admin-shell .ad-kpi { display: block; padding: 14px 16px 15px; }
        .admin-shell .ad-kpi-value {
          font-family: var(--fc-font-display, 'Fraunces', serif);
          font-size: 30px; line-height: 1; letter-spacing: -.025em; font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .admin-shell .ad-kpi-link { transition: border-color .16s, transform .16s; text-decoration: none; }
        .admin-shell .ad-kpi-link:hover {
          border-color: rgba(232,163,61,.45); transform: translateY(-2px);
        }
        .admin-shell .ad-chip {
          font-family: var(--fc-font-mono, ui-monospace, monospace);
          font-size: 10px; letter-spacing: .05em;
          padding: 2px 7px; border-radius: 999px;
          background: rgba(255,255,255,.06); border: 1px solid var(--ad-line);
          white-space: nowrap;
        }
        .admin-shell .ad-btn {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11.5px; font-weight: 600; line-height: 1;
          padding: 6px 11px; border-radius: 8px;
          border: 1px solid var(--ad-line); background: rgba(255,255,255,.045);
          color: rgba(255,255,255,.78); text-decoration: none;
          transition: background .14s, color .14s, border-color .14s; white-space: nowrap;
        }
        .admin-shell .ad-btn:hover {
          background: rgba(255,255,255,.09); color: #fff; border-color: rgba(255,255,255,.2);
        }
        .admin-shell .ad-btn-gold {
          border-color: rgba(232,163,61,.4); background: rgba(232,163,61,.12); color: var(--ad-gold-soft);
        }
        .admin-shell .ad-btn-gold:hover { background: rgba(232,163,61,.22); color: #fff; }
        .admin-shell .ad-table { border-collapse: collapse; font-size: 12.5px; }
        .admin-shell .ad-table th {
          text-align: left; padding: 7px 10px;
          font-family: var(--fc-font-mono, ui-monospace, monospace);
          font-size: 9.5px !important; letter-spacing: .16em; text-transform: uppercase;
          color: var(--ad-faint) !important; font-weight: 500;
          border-bottom: 1px solid var(--ad-line) !important; background: transparent !important;
        }
        .admin-shell .ad-table td {
          padding: 8px 10px; border-top: 1px solid var(--ad-line-soft);
          color: rgba(255,255,255,.8); vertical-align: middle;
        }
        .admin-shell .ad-table tbody tr:hover td { background: rgba(232,163,61,.045); }
        .admin-shell .ad-input {
          width: 190px; max-width: 46vw;
          background: rgba(0,0,0,.28); border: 1px solid var(--ad-line);
          border-radius: 8px; padding: 7px 10px;
          color: #fff; font-size: 12.5px;
          font-family: var(--fc-font-mono, ui-monospace, monospace);
          outline: none; transition: border-color .14s, box-shadow .14s;
        }
        .admin-shell .ad-input:focus {
          border-color: rgba(232,163,61,.55);
          box-shadow: 0 0 0 3px rgba(232,163,61,.14);
        }
        .admin-shell .ad-btn:disabled { opacity: .4; cursor: not-allowed; }
        /* Live environment pill in the top bar */
        .admin-shell .ad-env {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: var(--fc-font-mono, ui-monospace, monospace);
          font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase;
          padding: 4px 9px; border-radius: 999px;
          border: 1px solid rgba(52,211,153,.3); background: rgba(52,211,153,.08); color: #9FD4B5;
        }
        .admin-shell .ad-env .dot {
          width: 5px; height: 5px; border-radius: 50%; background: #7BC49A;
          box-shadow: 0 0 0 3px rgba(52,211,153,.18);
        }
      `}</style>
    </div>
  );
}

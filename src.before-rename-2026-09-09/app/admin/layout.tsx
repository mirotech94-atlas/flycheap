import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import { AdminSidebar } from './_components/AdminSidebar';
import { AdminBreadcrumb } from './_components/AdminBreadcrumb';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const h = await headers();
  const nextPath = h.get('x-pathname') || '/admin';
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (!isAdmin(user)) redirect('/');

  return (
    <div
      className="admin-shell text-white"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'auto',
        background:
          'linear-gradient(180deg, #0a3a6b 0%, #061a35 40%, #04101f 100%)',
      }}
    >
      <AdminSidebar email={user.email} />

      <div className="md:pl-[220px] min-h-screen flex flex-col">
        <header className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-[#0a1426]/60 backdrop-blur sticky top-0 z-30">
          <div className="md:hidden flex items-center gap-2">
            <Logo size={28} />
            <span className="font-semibold text-sm">Admin</span>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/45">
              FlyCheap · Admin
            </span>
            <span className="text-white/20">/</span>
            <AdminBreadcrumb />
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://flycheap.18dn.com/"
              className="text-xs px-3 py-1.5 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 transition text-white/80"
              title="Switch to the client portal"
            >
              ← Client portal
            </a>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-md border border-[#d4af37]/40 bg-[#d4af37]/10 hover:bg-[#d4af37]/20 transition text-[#f0d674]"
              title="Open the client app as a regular user (new tab)"
            >
              View as user ↗
            </a>
          </div>
        </header>

        <main className="admin-main flex-1 px-6 py-6 md:px-10 md:py-8">
          <div className="admin-surface w-full">{children}</div>
        </main>
      </div>

      <style>{`
        /* ============================================================
           FlyCheap Admin — Executive Command-Center
           Always-dark cockpit on the navy+gold token system. Restyles the
           shared primitives (.card / .eyebrow / h1-3 / tables / StatCard)
           so every admin page inherits the look from one place.
           ============================================================ */
        .admin-shell {
          --ad-panel:    #0e1d36;
          --ad-panel-2:  #0b1830;
          --ad-line:     rgba(255,255,255,.09);
          --ad-line-soft:rgba(255,255,255,.055);
          --ad-gold:     #d4af37;
          --ad-gold-soft:#f0d674;
          --ad-text:     #e8ecf4;
          --ad-muted:    rgba(255,255,255,.56);
          --ad-faint:    rgba(255,255,255,.4);
          font-family: var(--fc-font-sans, 'Manrope', system-ui, sans-serif);
        }

        /* Atmospheric main surface — subtle grid + radial brand glows */
        .admin-shell .admin-main {
          background:
            radial-gradient(820px 480px at 90% -10%, rgba(212,175,55,.10), transparent 60%),
            radial-gradient(720px 480px at -6% 112%, rgba(63,214,200,.07), transparent 55%),
            #0a1426 !important;
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
          background: linear-gradient(180deg, var(--ad-panel), var(--ad-panel-2)) !important;
          border: 1px solid var(--ad-line) !important;
          border-radius: 16px !important;
          color: var(--ad-text) !important;
          box-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 20px 44px -30px rgba(0,0,0,.85) !important;
          position: relative;
        }
        .admin-shell .card-elevated {
          border-color: rgba(212,175,55,.22) !important;
          background:
            linear-gradient(180deg, rgba(212,175,55,.05), transparent 40%),
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
        .admin-shell .kpi-brand { background: linear-gradient(135deg,#0a3a6b,#1f5fa5) !important; }

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
        .admin-shell table tbody tr:hover td { background: rgba(212,175,55,.05); }

        /* Inline code → gold chips */
        .admin-shell code {
          background: rgba(212,175,55,.1); color: var(--ad-gold-soft);
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
      `}</style>
    </div>
  );
}

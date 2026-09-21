import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { AdminSidebar } from './_components/AdminSidebar';
import { AdminBreadcrumb } from './_components/AdminBreadcrumb';
import { AdminFarePilotWidget } from '@/components/AdminFarePilotWidget';

import type { Metadata } from 'next';

/** The console inherited the client dashboard's title, so both tabs read
 *  "Executive Dashboard" — indistinguishable with the two open side by side.
 *  noindex as well: this is a founder-only surface and should never be listed,
 *  whatever robots.txt happens to say. */
export const metadata: Metadata = {
  title: 'Command centre — FlyCheap Admin',
  robots: { index: false, follow: false },
};

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
    <div className="ad-shell">
      <header className="ad-top">
        {/* Brand — mobile shows the mark + "Admin"; desktop shows the same
            mono label the console has always used. Not the handoff's brand-
            name/meta split: the controller's ruling keeps this string as one
            literal, matching the marketing/portal split done, this one not. */}
        <div className="ad-brand-slot">
          <div className="flex items-center gap-2 md:hidden">
            <Logo size={28} />
            <span className="ad-brand-mobile">Admin</span>
          </div>
          <span className="hidden md:inline ed-mono ad-crumb-brand">FlyCheap · Command Center</span>
        </div>

        <div className="hidden md:flex items-center gap-3 ad-crumb">
          <span className="ad-crumb-sep">/</span>
          <AdminBreadcrumb />
          <span className="ad-live ed-mono" title="You are viewing live production data">
            <span className="ed-dot" />Live · production
          </span>
        </div>

        <div className="flex items-center gap-3 ad-right">
          <span className="hidden md:inline ed-mono ad-founder">Founder access</span>
          <ThemeToggle />
        </div>
      </header>

      <AdminSidebar email={user.email} />

      <main className="ad-main ed-page">{children}</main>

      {/* Owner AI operator console — floating widget, reachable from every admin page. */}
      <AdminFarePilotWidget totpEnabled={farePilotTotpEnabled} />
    </div>
  );
}

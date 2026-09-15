'use client';

import { usePathname } from 'next/navigation';

// Map of the admin section labels — must stay in sync with the sidebar NAV.
const SECTION_LABEL: Record<string, string> = {
  '/admin':              'Command centre',
  '/admin/revenue':      'Revenue',
  '/admin/affiliate':    'Revenue',
  '/admin/clicks':       'Click stream',
  '/admin/signups':      'Acquisition',
  '/admin/users':        'Accounts',
  '/admin/health':       'Fare engine',
  '/admin/queue':        'Content queue',
  '/admin/errors':       'Errors',
  '/admin/integrations': 'Integrations',
  '/admin/settings':     'Settings',
};

export function AdminBreadcrumb() {
  const pathname = usePathname() || '/admin';
  // Match the longest registered prefix.
  const match = Object.keys(SECTION_LABEL)
    .sort((a, b) => b.length - a.length)
    .find(prefix => pathname === prefix || pathname.startsWith(prefix + '/'));
  const label = match ? SECTION_LABEL[match] : 'Command centre';
  return (
    <span className="text-[12px] font-semibold tracking-tight text-white">
      {label}
    </span>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/',             label: 'Dashboard' },
  { href: '/explore',      label: 'Explore'   },
  { href: '/offers',       label: 'Offers'    },
  { href: '/hotels',       label: 'Hotels'    },
  { href: '/searches',     label: 'Searches'  },
  { href: '/integrations', label: 'Integrations' },
  { href: '/settings',     label: 'Settings'  },
];

export function NavLinks() {
  const pathname = usePathname() || '/';
  return (
    <nav className="flex gap-1">
      {LINKS.map(l => {
        const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={`nav-link ${active ? 'active' : ''}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

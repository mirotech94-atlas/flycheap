'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppI18n } from '@/lib/i18n/client';
import type { AppNavDict } from '@/lib/i18n/app.en';
import { NavIcon } from '@/components/NavIcons';

const LINKS: Array<{ href: string; key: keyof AppNavDict }> = [
  { href: '/',             key: 'dashboard' },
  { href: '/explore',      key: 'explore'   },
  { href: '/offers',       key: 'offers'    },
  { href: '/hotels',       key: 'hotels'    },
  { href: '/routes',       key: 'routes'    },
  { href: '/guides',       key: 'guides'    },
  { href: '/pricing',      key: 'pricing'   },
  { href: '/searches',     key: 'searches'  },
  { href: '/integrations', key: 'integrations' },
  { href: '/settings',     key: 'settings'  },
];

export function NavLinks() {
  const pathname = usePathname() || '/';
  const { nav } = useAppI18n();
  return (
    <nav className="flex gap-1">
      {LINKS.map(l => {
        const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={`nav-link ${active ? 'active' : ''}`}>
            <NavIcon name={l.key} size={16} />
            {nav[l.key]}
          </Link>
        );
      })}
    </nav>
  );
}

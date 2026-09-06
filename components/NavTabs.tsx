'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: 'board', label: 'Board' },
  { href: 'list', label: 'List' },
  { href: 'dashboard', label: 'Dashboard' },
];

export function NavTabs({ engagementId, isProm }: { engagementId: string; isProm: boolean }) {
  const pathname = usePathname();
  const tabs = isProm ? [...TABS, { href: 'settings', label: 'Settings' }] : TABS;

  return (
    <nav className="flex gap-1 border-t border-ink-soft/10 px-6">
      {tabs.map((tab) => {
        const href = `/${engagementId}/${tab.href}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.href}
            href={href}
            className={`px-3 py-2 text-sm ${
              active ? 'border-b-2 border-brand-navy font-medium text-ink' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconChartLine, IconLayoutKanban, IconList, IconMenu2, IconSettings, type Icon } from '@tabler/icons-react';
import { activeNavSection, NAV_SECTIONS, type NavSectionKey } from '@/lib/navSections';

const ICONS: Record<NavSectionKey, Icon> = {
  board: IconLayoutKanban,
  list: IconList,
  dashboard: IconChartLine,
  settings: IconSettings,
};

const COLLAPSED_STORAGE_KEY = 'sidebar-collapsed';

export function Sidebar({ engagementId, isProm }: { engagementId: string; isProm: boolean }) {
  const pathname = usePathname();
  const active = activeNavSection(pathname, engagementId);
  const sections = isProm ? NAV_SECTIONS : NAV_SECTIONS.filter((s) => s.key !== 'settings');

  // Collapse only applies at desktop widths (see the `md:` classes below) —
  // on narrow viewports the sidebar always shows full labels, since the
  // toggle button itself is hidden there and there's no horizontal space to
  // reclaim in a stacked mobile layout anyway.
  //
  // Starts expanded (matching what the server rendered, since the server
  // has no access to localStorage) and only reads the saved preference in
  // an effect after mount, to avoid a hydration mismatch. Returning users
  // who previously collapsed it will see a brief expanded-then-collapsed
  // flash on load — an accepted tradeoff of this SSR-safe pattern.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true');
    } catch {
      // localStorage unavailable (private browsing, etc.) — stay expanded
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // ignore — collapsing still works for this session, just won't persist
      }
      return next;
    });
  }

  return (
    <nav className={`flex w-full shrink-0 flex-col gap-1 bg-ink py-3 ${collapsed ? 'md:w-16' : 'md:w-56'}`}>
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={`mb-2 hidden h-9 items-center px-4 text-primary-soft/70 hover:text-white md:flex ${
          collapsed ? 'md:justify-center md:px-0' : ''
        }`}
      >
        <IconMenu2 className="h-5 w-5 shrink-0" stroke={1.5} />
      </button>
      {sections.map((section) => {
        const isActive = section.key === active;
        const SectionIcon = ICONS[section.key];
        return (
          <Link
            key={section.key}
            href={`/${engagementId}/${section.key}`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={section.label}
            title={section.label}
            className={`flex items-center gap-3 border-l-4 px-4 py-3 text-sm font-bold ${
              collapsed ? 'md:justify-center md:gap-0 md:px-0' : ''
            } ${
              isActive
                ? 'border-brand-green bg-primary-active text-white'
                : 'border-transparent text-primary-soft/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <SectionIcon className="h-4 w-4 shrink-0" stroke={1.5} />
            <span className={collapsed ? 'md:hidden' : ''}>{section.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

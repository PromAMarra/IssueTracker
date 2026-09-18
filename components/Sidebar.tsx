'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconChartLine, IconLayoutKanban, IconList, IconSettings, type Icon } from '@tabler/icons-react';
import { activeNavSection, NAV_SECTIONS, type NavSectionKey } from '@/lib/navSections';

const ICONS: Record<NavSectionKey, Icon> = {
  board: IconLayoutKanban,
  list: IconList,
  dashboard: IconChartLine,
  settings: IconSettings,
};

export function Sidebar({ engagementId, isProm }: { engagementId: string; isProm: boolean }) {
  const pathname = usePathname();
  const active = activeNavSection(pathname, engagementId);
  const sections = isProm ? NAV_SECTIONS : NAV_SECTIONS.filter((s) => s.key !== 'settings');

  return (
    <nav className="flex w-full shrink-0 flex-col gap-1 bg-ink py-3 md:w-56">
      {sections.map((section) => {
        const isActive = section.key === active;
        const SectionIcon = ICONS[section.key];
        return (
          <Link
            key={section.key}
            href={`/${engagementId}/${section.key}`}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-3 border-l-4 px-4 py-3 text-sm font-bold ${
              isActive
                ? 'border-brand-green bg-primary-active text-white'
                : 'border-transparent text-primary-soft/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <SectionIcon className="h-4 w-4" stroke={1.5} />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

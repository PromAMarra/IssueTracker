'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartLine, faGear, faList, faTableColumns, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { activeNavSection, NAV_SECTIONS, type NavSectionKey } from '@/lib/navSections';

const ICONS: Record<NavSectionKey, IconDefinition> = {
  board: faTableColumns,
  list: faList,
  dashboard: faChartLine,
  settings: faGear,
};

export function Sidebar({ engagementId, isProm }: { engagementId: string; isProm: boolean }) {
  const pathname = usePathname();
  const active = activeNavSection(pathname, engagementId);
  const sections = isProm ? NAV_SECTIONS : NAV_SECTIONS.filter((s) => s.key !== 'settings');

  return (
    <nav className="flex w-full shrink-0 flex-col gap-1 bg-ink p-3 md:w-56">
      {sections.map((section) => {
        const isActive = section.key === active;
        return (
          <Link
            key={section.key}
            href={`/${engagementId}/${section.key}`}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-bold ${
              isActive ? 'bg-white/10 text-white' : 'text-primary-soft/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <FontAwesomeIcon icon={ICONS[section.key]} className={`h-4 w-4 ${isActive ? 'text-brand-green' : ''}`} />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

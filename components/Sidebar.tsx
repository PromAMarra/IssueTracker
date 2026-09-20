'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  IconChartLine,
  IconChevronRight,
  IconClipboardCheck,
  IconLayoutKanban,
  IconList,
  IconMenu2,
  IconSettings,
  type Icon,
} from '@tabler/icons-react';
import { activeNavSection, NAV_SECTIONS, type NavSectionKey } from '@/lib/navSections';

const ICONS: Record<NavSectionKey, Icon> = {
  board: IconLayoutKanban,
  list: IconList,
  dashboard: IconChartLine,
  'testing-lab': IconClipboardCheck,
  settings: IconSettings,
};

const COLLAPSED_STORAGE_KEY = 'sidebar-collapsed';

type SubItem = { id: string; label: string; href: string };

export function Sidebar({
  engagementId,
  isProm,
  testCasesEnabled,
  testPackages,
}: {
  engagementId: string;
  isProm: boolean;
  testCasesEnabled: boolean;
  testPackages: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  // Subscribes to every search-param change app-wide (React context has no
  // per-key selector), even though only the dashboard/testing-lab routes
  // below ever read a key from it. A narrower subscription would require
  // splitting the sub-nav out into its own client component — not done here.
  const searchParams = useSearchParams();
  const active = activeNavSection(pathname, engagementId);
  const sections = NAV_SECTIONS.filter(
    (s) => (s.key !== 'settings' || isProm) && (s.key !== 'testing-lab' || testCasesEnabled),
  );

  // Dashboard only splits into two views once test case tracking is on —
  // with only one view there's nothing to switch between, so no sub-items.
  const dashboardSubItems: SubItem[] = testCasesEnabled
    ? [
        { id: 'issues', label: 'Issue Insights', href: `/${engagementId}/dashboard` },
        { id: 'testing', label: 'Testing Insights', href: `/${engagementId}/dashboard?view=testing` },
      ]
    : [];
  const testingLabSubItems: SubItem[] = testPackages.map((pkg) => ({
    id: pkg.id,
    label: pkg.name,
    href: `/${engagementId}/testing-lab?package=${pkg.id}`,
  }));
  const subItemsBySection: Partial<Record<NavSectionKey, SubItem[]>> = {
    dashboard: dashboardSubItems,
    'testing-lab': testingLabSubItems,
  };

  // Which sub-item (if any) reads as selected — mirrors each page's own
  // default-resolution logic so the sidebar never shows nothing selected
  // while a view/package is in fact being shown.
  const activeSubItemId: Partial<Record<NavSectionKey, string | null>> = {
    dashboard:
      active === 'dashboard'
        ? searchParams.get('view') === 'testing' && testCasesEnabled
          ? 'testing'
          : 'issues'
        : null,
    'testing-lab':
      active === 'testing-lab' ? (searchParams.get('package') ?? testPackages[0]?.id ?? null) : null,
  };

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

  // Whether each section's sub-list is expanded, keyed by section. Absent
  // means the user hasn't manually toggled that section yet, so it falls
  // back to auto-expanding when the user is actually on that section's
  // route. Once they click a chevron, their explicit choice sticks instead
  // of being forced back open or closed on every re-render.
  const [manualExpanded, setManualExpanded] = useState<Partial<Record<NavSectionKey, boolean>>>({});

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
        const subItems = subItemsBySection[section.key] ?? [];
        // A section with sub-items must never share the "selected" highlight
        // between its own row and one of its sub-items — showing both at
        // once reads as two things being selected. When it has sub-items, a
        // sub-item is always what should read as selected instead.
        const hasSubItems = subItems.length > 0;
        const parentHighlighted = isActive && !hasSubItems;
        const isExpanded = hasSubItems && (manualExpanded[section.key] ?? active === section.key);
        const currentSubItemId = activeSubItemId[section.key] ?? null;
        return (
          <div key={section.key}>
            <div className="flex items-stretch">
              <Link
                href={`/${engagementId}/${section.key}`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={section.label}
                title={section.label}
                className={`flex flex-1 items-center gap-3 border-l-4 px-4 py-3 text-sm font-bold ${
                  collapsed ? 'md:justify-center md:gap-0 md:px-0' : ''
                } ${
                  parentHighlighted
                    ? 'border-brand-green bg-primary-active text-white'
                    : 'border-transparent text-primary-soft/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <SectionIcon className="h-4 w-4 shrink-0" stroke={1.5} />
                <span className={collapsed ? 'md:hidden' : ''}>{section.label}</span>
              </Link>
              {hasSubItems && !collapsed && (
                <button
                  type="button"
                  onClick={() => setManualExpanded((prev) => ({ ...prev, [section.key]: !isExpanded }))}
                  aria-label={isExpanded ? `Collapse ${section.label}` : `Expand ${section.label}`}
                  aria-expanded={isExpanded}
                  className="flex items-center px-3 text-primary-soft/70 hover:text-white"
                >
                  <IconChevronRight
                    className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    stroke={1.5}
                  />
                </button>
              )}
            </div>
            {hasSubItems && isExpanded && !collapsed && (
              <div>
                {subItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={item.id === currentSubItemId ? 'page' : undefined}
                    title={item.label}
                    className={`block truncate border-l-4 py-2 pl-12 pr-4 text-sm font-medium ${
                      item.id === currentSubItemId
                        ? 'border-brand-green bg-primary-active text-white'
                        : 'border-transparent text-primary-soft/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

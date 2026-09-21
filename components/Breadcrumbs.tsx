'use client';

import { usePathname } from 'next/navigation';
import { activeNavSection, NAV_SECTIONS } from '@/lib/navSections';

/**
 * Tiny "Home / <Section>" trail shown above the page content for an
 * engagement-scoped route (Board, List, Dashboard, Testing Lab, Settings).
 *
 * Responsibility: derives the current section purely from the URL
 * (`pathname` + `engagementId`) via `activeNavSection`/`NAV_SECTIONS` in
 * `lib/navSections.ts` — the single source of truth also used by `Sidebar`
 * to highlight the active nav item. Keep these two in sync if routes change.
 * Renders nothing extra (no engagement name) when the path doesn't match a
 * known section, e.g. on `/[engagementId]` itself.
 */
export function Breadcrumbs({ engagementId }: { engagementId: string }) {
  const pathname = usePathname();
  const active = activeNavSection(pathname, engagementId);
  const label = NAV_SECTIONS.find((s) => s.key === active)?.label;

  return (
    <p className="mb-4 text-xs text-ink-soft">
      <span className="font-bold text-ink">Home</span>
      {label && <> / {label}</>}
    </p>
  );
}

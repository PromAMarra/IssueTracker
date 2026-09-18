'use client';

import { usePathname } from 'next/navigation';
import { activeNavSection, NAV_SECTIONS } from '@/lib/navSections';

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

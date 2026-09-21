/**
 * Defines the fixed set of top-level, per-engagement navigation sections
 * (Board / List / Dashboard / Testing Lab / Settings) and a pure helper to
 * work out which one is "active" for a given URL. Consumed by
 * components/Sidebar.tsx (to highlight the current section) and
 * components/Breadcrumbs.tsx.
 *
 * Every app route lives under `/[engagementId]/<sectionKey>[/...]`, so
 * `activeNavSection` only needs the pathname and the current engagement id —
 * it does no routing or data fetching itself.
 *
 * Gotcha: NAV_SECTIONS is the single source of truth for valid section keys,
 * but nothing here enforces that every route under app/(app)/[engagementId]/
 * actually corresponds to one of these keys — adding a new top-level route
 * without adding a matching entry here means it will render with no nav item
 * highlighted, rather than failing to compile.
 */
export type NavSectionKey = 'board' | 'list' | 'dashboard' | 'testing-lab' | 'settings';

export const NAV_SECTIONS: { key: NavSectionKey; label: string }[] = [
  { key: 'board', label: 'Board' },
  { key: 'list', label: 'List' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'testing-lab', label: 'Testing Lab' },
  { key: 'settings', label: 'Settings' },
];

export function activeNavSection(pathname: string, engagementId: string): NavSectionKey | null {
  const prefix = `/${engagementId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  // Match the bare section (e.g. "board") as well as any sub-route beneath it
  // (e.g. "board/123") so a detail/child page still highlights its parent
  // section in the nav rather than showing nothing selected.
  const match = NAV_SECTIONS.find((s) => rest === s.key || rest.startsWith(`${s.key}/`));
  return match ? match.key : null;
}

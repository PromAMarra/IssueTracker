export type NavSectionKey = 'board' | 'list' | 'dashboard' | 'settings';

export const NAV_SECTIONS: { key: NavSectionKey; label: string }[] = [
  { key: 'board', label: 'Board' },
  { key: 'list', label: 'List' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'settings', label: 'Settings' },
];

export function activeNavSection(pathname: string, engagementId: string): NavSectionKey | null {
  const prefix = `/${engagementId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const match = NAV_SECTIONS.find((s) => rest === s.key || rest.startsWith(`${s.key}/`));
  return match ? match.key : null;
}
